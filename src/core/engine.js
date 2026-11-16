import { DockerAdapter } from "../adapters/docker.js";
import { GitHubAdapter } from "../adapters/github.js";
import { HealthAdapter } from "../adapters/health.js";
import {
  ConfigError,
  DockerError,
  GitHubError,
  HealthCheckError,
  RollbackError,
  UpdateInProgressError,
  UpdatePilotError,
} from "../utils/errors.js";
import { defineConfig } from "./config.js";
import { HookBus, HOOKS } from "./events.js";

/** @typedef {{ status: "up-to-date", currentVersion: string, latestVersion: string | null, checkedAt: string }} UpToDateResult */
/** @typedef {{ status: "updated", from: string, to: string | null, newContainerId: string | null, healthLatencyMs: number, durationMs: number, checkedAt: string }} UpdatedResult */
/** @typedef {{ status: "rolled-back", reason: "health-check-failed", from: string, to: string | null, healthError: { message: string, context: Record<string, unknown> }, durationMs: number }} RolledBackResult */
/** @typedef {{ status: "dry-run", wouldDeploy: { from: string, to: string | null }, checkedAt: string }} DryRunResult */
/** @typedef {UpToDateResult | UpdatedResult | RolledBackResult | DryRunResult} UpdateResult */
/** @typedef {{ status: "rolled-back-manual", to: string }} ManualRollbackResult */
/** @typedef {UpdateResult | ManualRollbackResult} EngineLastResult */
/** @typedef {{ from: string, to: string | null, healthUrl: string, previousContainerId: string | null, newContainerId: string | null, candidatePorts: Record<string, Array<{ HostIp: string, HostPort: string }>> }} TrafficRouterDeployment */
/** @typedef {{ deployment: TrafficRouterDeployment, context: unknown }} TrafficRouterState */
/** @typedef {{ prepare: (deployment: TrafficRouterDeployment) => Promise<{ healthUrl: string, context?: unknown }>, switch: (deployment: TrafficRouterDeployment, context?: unknown) => Promise<void>, rollback: (deployment: TrafficRouterDeployment, context?: unknown, reason?: string) => Promise<void> }} TrafficRouter */
/** @typedef {{ githubAdapter?: Object, dockerAdapter?: Object, healthAdapter?: Object, trafficRouter?: TrafficRouter, logger?: Object, hookBus?: HookBus }} UpdatePilotDependencies */
/** @typedef {{ running: boolean, lastResult: EngineLastResult | null, currentVersion: string, repo: string, uptime: { startedAt: string, engineSince: string } }} EngineStatus */

/**
 * Coordinate release checks, Docker deployment, health verification, and rollback.
 * @example
 * const pilot = new UpdatePilot({ repo: "acme/app", currentVersion: "1.2.3", docker: { image: "ghcr.io/acme/app" }, health: { url: "http://localhost:3000/health" } });
 * await pilot.runUpdate();
 */
export class UpdatePilot {
  /**
   * Validate configuration and prepare an update engine with injectable adapters.
   * @param {Record<string, any>} userConfig User configuration passed to defineConfig.
   * @param {UpdatePilotDependencies} [deps] Optional adapters, logger, and hook bus.
   * @example
   * new UpdatePilot(config, { githubAdapter, dockerAdapter, healthAdapter });
   */
  constructor(userConfig, deps = {}) {
    this._config = defineConfig(userConfig);
    this._logger = deps.logger || this._config.logger;
    this._hooks = deps.hookBus || new HookBus();
    this._github = deps.githubAdapter;
    this._docker = deps.dockerAdapter;
    this._health = deps.healthAdapter;
    this._trafficRouter = deps.trafficRouter;
    this._adapterOwnsHandoff = false;
    this._engineSince = new Date().toISOString();
    this._runStartedAt = null;
    this._running = false;
    /** @type {EngineLastResult | null} */
    this._lastResult = null;
    /** @type {UpdatedResult | null} */
    this._lastSuccessfulUpdate = null;
    /** @type {string | null} */
    this._pendingRollbackVersion = null;
    /** @type {TrafficRouterState | null} */
    this._pendingTrafficState = null;
    /** @type {TrafficRouterState | null} */
    this._lastSuccessfulTrafficState = null;
    for (const [name, handler] of Object.entries(this._config.hooks)) {
      this._hooks.on(
        HOOKS[name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()],
        handler,
      );
    }
  }

  /**
   * @returns {Record<string, any>} Frozen resolved configuration.
   * @example
   * const repository = pilot.config.repo;
   */
  get config() {
    return this._config;
  }
  /**
   * @returns {Object} Logger used by this engine.
   * @example
   * pilot.logger.info("Engine ready");
   */
  get logger() {
    return this._logger;
  }
  /**
   * @returns {HookBus} Lifecycle hook bus.
   * @example
   * pilot.hooks.listenerCount(HOOKS.BEFORE_CHECK);
   */
  get hooks() {
    return this._hooks;
  }

  /**
   * Check for a release without deploying it.
   * @returns {Promise<import("../adapters/github.js").GitHubCheckResult>} Latest release comparison.
   * @example
   * const check = await pilot.checkOnly();
   */
  async checkOnly() {
    if (this._running)
      throw new UpdateInProgressError("An update is already in progress");
    const startedAt = Date.now();
    try {
      this._ensureAdapters({ docker: false, health: false });
      await this._emitSafe(HOOKS.BEFORE_CHECK, {
        currentVersion: this._config.currentVersion,
      });
      const result = await this._github.check();
      await this._emitSafe(HOOKS.AFTER_CHECK, { result });
      return result;
    } catch (error) {
      const wrapped = this._wrapError(error, "check", startedAt);
      await this._emitSafe(HOOKS.ON_ERROR, wrapped);
      throw wrapped;
    }
  }

  /**
   * Run the complete check, deploy, verify, finalize, or rollback lifecycle.
   * @param {{ dryRun?: boolean, force?: boolean }} [options] Avoid deployment or redeploy regardless of version comparison.
   * @returns {Promise<UpdateResult>} Structured update outcome.
   * @example
   * const result = await pilot.runUpdate({ dryRun: false, force: false });
   */
  async runUpdate({ dryRun = false, force = false } = {}) {
    if (this._running)
      throw new UpdateInProgressError("An update is already in progress");
    this._running = true;
    this._runStartedAt = Date.now();
    const startedAt = this._runStartedAt;
    let phase = "check";
    try {
      this._ensureAdapters({ docker: false, health: false });
      await this._emitSafe(HOOKS.BEFORE_CHECK, {
        currentVersion: this._config.currentVersion,
      });
      const checkResult = await this._github.check();
      await this._emitSafe(HOOKS.AFTER_CHECK, { result: checkResult });
      const { currentVersion } = this._config;
      const latestVersion = checkResult.latestVersion;
      const checkedAt = new Date().toISOString();
      if (!checkResult.updateAvailable && !force) {
        /** @type {UpToDateResult} */
        const result = {
          status: "up-to-date",
          currentVersion,
          latestVersion,
          checkedAt,
        };
        this._lastResult = result;
        return result;
      }
      if (latestVersion === null)
        throw new GitHubError(
          "Cannot deploy because no eligible GitHub release was found",
          {
            context: {
              repo: this._config.repo,
              currentVersion,
              force,
            },
          },
        );
      await this._emitSafe(HOOKS.BEFORE_DEPLOY, {
        from: currentVersion,
        to: latestVersion,
      });
      if (dryRun) {
        /** @type {DryRunResult} */
        const result = {
          status: "dry-run",
          wouldDeploy: { from: currentVersion, to: latestVersion },
          checkedAt,
        };
        this._lastResult = result;
        return result;
      }
      if (this._pendingRollbackVersion !== null)
        throw new RollbackError(
          "A deployment recovery is pending; roll it back before updating",
        );

      phase = "deploy";
      this._ensureAdapters({ github: false, health: false });
      const trafficRouter = this._requireTrafficRouter();
      const deployResult = await this._docker.deploy(latestVersion);
      this._lastSuccessfulUpdate = null;
      this._lastSuccessfulTrafficState = null;
      this._pendingRollbackVersion = currentVersion;
      /** @type {TrafficRouterDeployment} */
      const trafficDeployment = {
        from: currentVersion,
        to: latestVersion,
        healthUrl: this._adapterOwnsHandoff
          ? (deployResult.healthUrl ?? this._config.health.url)
          : this._config.health.url,
        previousContainerId: deployResult.previousContainerId ?? null,
        newContainerId: deployResult.newContainerId ?? null,
        candidatePorts: deployResult.candidatePorts ?? {},
      };
      /** @type {TrafficRouterState} */
      const trafficState = {
        deployment: trafficDeployment,
        context: undefined,
      };
      this._pendingTrafficState = trafficState;
      let preparation;
      try {
        preparation = await trafficRouter.prepare(trafficDeployment);
        trafficState.context = preparation?.context;
        if (!preparation || typeof preparation.healthUrl !== "string")
          throw new ConfigError(
            "trafficRouter.prepare() must return a candidate healthUrl",
            { context: { field: "trafficRouter.prepare.healthUrl" } },
          );
        let candidateHealthUrl;
        try {
          candidateHealthUrl = new URL(preparation.healthUrl);
        } catch {
          throw new ConfigError(
            "trafficRouter.prepare() must return an absolute HTTP or HTTPS candidate healthUrl",
            { context: { field: "trafficRouter.prepare.healthUrl" } },
          );
        }
        candidateHealthUrl.hash = "";
        const liveHealthUrl = new URL(trafficDeployment.healthUrl);
        liveHealthUrl.hash = "";
        if (
          (candidateHealthUrl.protocol !== "http:" &&
            candidateHealthUrl.protocol !== "https:") ||
          (!this._adapterOwnsHandoff &&
            candidateHealthUrl.href === liveHealthUrl.href)
        )
          throw new ConfigError(
            "trafficRouter.prepare() must return a candidate-only HTTP or HTTPS healthUrl distinct from the live healthUrl",
            { context: { field: "trafficRouter.prepare.healthUrl" } },
          );
      } catch (prepareError) {
        try {
          await this._rollbackDeployment(
            trafficState,
            prepareError,
            "prepare-failed",
          );
        } catch (rollbackError) {
          const catastrophic = new RollbackError(
            "CRITICAL: traffic-router preparation failed AND rollback failed — manual intervention required",
            {
              cause: rollbackError,
              context: { prepareError, rollbackError },
            },
          );
          await this._emitSafe(HOOKS.ON_ERROR, catastrophic);
          throw catastrophic;
        }
        throw prepareError;
      }
      await this._emitSafe(HOOKS.AFTER_DEPLOY, {
        from: currentVersion,
        to: latestVersion,
        deployResult,
        durationMs: Date.now() - startedAt,
      });

      phase = "verify";
      this._ensureAdapters({ github: false, docker: false });
      await this._emitSafe(HOOKS.BEFORE_VERIFY, {
        url: preparation.healthUrl,
      });
      let healthResult;
      try {
        healthResult = await this._health.check({ url: preparation.healthUrl });
      } catch (healthError) {
        if (!(healthError instanceof HealthCheckError)) throw healthError;
        if (!this._config.rollback.enabled) {
          try {
            await trafficRouter.rollback(
              trafficDeployment,
              trafficState.context,
              "health-check-failed",
            );
          } catch (rollbackError) {
            const catastrophic = new RollbackError(
              "CRITICAL: automatic Docker rollback is disabled AND route cleanup failed",
              {
                cause: rollbackError,
                context: { healthError, rollbackError },
              },
            );
            await this._emitSafe(HOOKS.ON_ERROR, catastrophic);
            throw catastrophic;
          }
          throw healthError;
        }
        await this._emitSafe(HOOKS.BEFORE_ROLLBACK, {
          reason: "health-failed",
          healthError,
        });
        try {
          await this._rollbackDeployment(
            trafficState,
            healthError,
            "health-check-failed",
          );
          await this._emitSafe(HOOKS.AFTER_ROLLBACK, { success: true });
        } catch (rollbackError) {
          const catastrophic = new RollbackError(
            "CRITICAL: health check failed AND rollback failed — manual intervention required",
            {
              cause: rollbackError,
              context: { healthError, rollbackError },
            },
          );
          await this._emitSafe(HOOKS.ON_ERROR, catastrophic);
          throw catastrophic;
        }
        /** @type {RolledBackResult} */
        const result = {
          status: "rolled-back",
          reason: "health-check-failed",
          from: currentVersion,
          to: latestVersion,
          healthError: {
            message: healthError.message,
            context: healthError.context ?? {},
          },
          durationMs: Date.now() - startedAt,
        };
        this._lastResult = result;
        return result;
      }
      await this._emitSafe(HOOKS.AFTER_VERIFY, { healthResult });

      phase = "switch";
      try {
        await trafficRouter.switch(trafficDeployment, trafficState.context);
      } catch (switchError) {
        try {
          await this._rollbackDeployment(
            trafficState,
            switchError,
            "switch-failed",
          );
        } catch (rollbackError) {
          const catastrophic = new RollbackError(
            "CRITICAL: traffic switch failed AND rollback failed — manual intervention required",
            {
              cause: rollbackError,
              context: { switchError, rollbackError },
            },
          );
          await this._emitSafe(HOOKS.ON_ERROR, catastrophic);
          throw catastrophic;
        }
        throw switchError;
      }

      phase = "finalize";
      await this._docker.finalize();
      /** @type {UpdatedResult} */
      const result = {
        status: "updated",
        from: currentVersion,
        to: latestVersion,
        newContainerId: deployResult.newContainerId ?? null,
        healthLatencyMs: healthResult.latencyMs,
        durationMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
      };
      this._lastResult = result;
      this._lastSuccessfulUpdate = result;
      this._lastSuccessfulTrafficState = trafficState;
      this._pendingTrafficState = null;
      this._pendingRollbackVersion = null;
      return result;
    } catch (error) {
      if (
        error instanceof RollbackError &&
        error.message.startsWith("CRITICAL:")
      )
        throw error;
      const wrapped = this._wrapError(error, phase, startedAt);
      await this._emitSafe(HOOKS.ON_ERROR, wrapped);
      throw wrapped;
    } finally {
      this._running = false;
      this._runStartedAt = null;
    }
  }

  /**
   * Return current engine activity and the most recent result.
   * @returns {EngineStatus} Read-only engine status.
   * @example
   * const status = pilot.getStatus();
   */
  getStatus() {
    return {
      running: this._running,
      lastResult: this._lastResult,
      currentVersion: this._config.currentVersion,
      repo: this._config.repo,
      uptime: {
        startedAt: this._runStartedAt
          ? new Date(this._runStartedAt).toISOString()
          : this._engineSince,
        engineSince: this._engineSince,
      },
    };
  }

  /**
   * Manually roll back the most recent successful update.
   * @returns {Promise<{ status: "rolled-back-manual", to: string }>} Manual rollback result.
   * @example
   * const result = await pilot.rollback();
   */
  async rollback() {
    if (this._running)
      throw new UpdateInProgressError("An update is already in progress");
    const rollbackVersion =
      this._pendingRollbackVersion ??
      (this._lastSuccessfulUpdate?.status === "updated"
        ? this._lastSuccessfulUpdate.from
        : null);
    const trafficState =
      this._pendingTrafficState ?? this._lastSuccessfulTrafficState;
    if (rollbackVersion === null)
      throw new RollbackError("No successful update to roll back");
    if (trafficState && !trafficState.deployment.previousContainerId)
      throw new RollbackError("No previous container to restore");
    this._running = true;
    this._runStartedAt = Date.now();
    try {
      this._ensureAdapters({ github: false, health: false });
      await this._emitSafe(HOOKS.BEFORE_ROLLBACK, {
        reason: "manual",
        to: rollbackVersion,
      });
      if (
        trafficState?.deployment.previousContainerId &&
        typeof this._docker.restorePrevious === "function"
      ) {
        const restored = await this._docker.restorePrevious();
        if (!restored?.restoredContainerId)
          throw new RollbackError(
            "Docker could not prepare the previous container for traffic restoration",
          );
      }
      if (trafficState)
        await this._trafficRouter.rollback(
          trafficState.deployment,
          trafficState.context,
          "manual",
        );
      const rollbackResult = await this._docker.rollback();
      if (!rollbackResult?.rolledBack || !rollbackResult.restoredContainerId)
        throw new RollbackError(
          "Docker rollback did not restore a previous container",
        );
      await this._emitSafe(HOOKS.AFTER_ROLLBACK, {
        success: true,
        manual: true,
      });
      /** @type {ManualRollbackResult} */
      const result = { status: "rolled-back-manual", to: rollbackVersion };
      this._lastResult = result;
      this._lastSuccessfulUpdate = null;
      this._lastSuccessfulTrafficState = null;
      this._pendingTrafficState = null;
      this._pendingRollbackVersion = null;
      return result;
    } catch (error) {
      const wrapped =
        error instanceof RollbackError
          ? error
          : new RollbackError(
              "CRITICAL: manual rollback failed — manual intervention required",
              {
                cause: error,
                context: { operation: "manual-rollback", error },
              },
            );
      await this._emitSafe(HOOKS.ON_ERROR, wrapped);
      throw wrapped;
    } finally {
      this._running = false;
      this._runStartedAt = null;
    }
  }

  _requireTrafficRouter() {
    const router = this._trafficRouter;
    if (
      router &&
      typeof router.prepare === "function" &&
      typeof router.switch === "function" &&
      typeof router.rollback === "function"
    )
      return router;
    if (!router && this._docker && !(this._docker instanceof DockerAdapter)) {
      this._adapterOwnsHandoff = true;
      this._trafficRouter = {
        prepare: async (deployment) => ({ healthUrl: deployment.healthUrl }),
        switch: async () => {},
        rollback: async () => {},
      };
      return this._trafficRouter;
    }
    if (router)
      throw new ConfigError(
        "trafficRouter must implement prepare(), switch(), and rollback()",
        { context: { field: "trafficRouter" } },
      );
    else
      throw new ConfigError(
        "A trafficRouter with prepare(), switch(), and rollback() is required for safe deployments",
        { context: { field: "trafficRouter" } },
      );
  }

  async _rollbackDeployment(trafficState, originalError, reason) {
    await this._trafficRouter.rollback(
      trafficState.deployment,
      trafficState.context,
      reason,
    );
    const rollbackResult = await this._docker.rollback(originalError);
    if (
      !rollbackResult?.rolledBack ||
      (trafficState.deployment.previousContainerId &&
        !rollbackResult.restoredContainerId)
    )
      throw new Error("Docker rollback did not restore the previous container");
    this._pendingTrafficState = null;
    this._pendingRollbackVersion = null;
    return rollbackResult;
  }

  async _emitSafe(event, payload) {
    try {
      const { errors = [] } = await this._hooks.emitSafe(event, payload);
      for (const error of errors) {
        try {
          this._logger.warn("Update lifecycle hook failed", {
            event,
            error: error instanceof Error ? error.message : String(error),
          });
        } catch {
          // Hook logging must never interrupt the update lifecycle.
        }
      }
    } catch (error) {
      try {
        this._logger.warn("Could not emit update lifecycle hook", {
          event,
          error: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // Hook logging must never interrupt the update lifecycle.
      }
    }
  }

  _wrapError(error, phase, startedAt) {
    const context = {
      ...(error instanceof UpdatePilotError ? error.context : {}),
      phase,
      durationMs: Date.now() - startedAt,
    };
    const options = {
      cause: error instanceof UpdatePilotError ? (error.cause ?? error) : error,
      context,
    };
    if (error instanceof ConfigError)
      return new ConfigError(error.message, options);
    if (error instanceof UpdateInProgressError)
      return new UpdateInProgressError(error.message, options);
    if (error instanceof HealthCheckError)
      return new HealthCheckError(error.message, options);
    if (error instanceof GitHubError)
      return new GitHubError(error.message, options);
    if (error instanceof DockerError)
      return new DockerError(error.message, options);
    if (error instanceof RollbackError)
      return new RollbackError(error.message, options);
    if (error instanceof UpdatePilotError)
      return new UpdatePilotError(error.message, options);
    return new UpdatePilotError(
      error instanceof Error ? error.message : String(error),
      { cause: error, context },
    );
  }

  _ensureAdapters({ github = true, docker = true, health = true } = {}) {
    if (github && !this._github)
      this._github = new GitHubAdapter({
        ...this._config.github,
        repo: this._config.repo,
        currentVersion: this._config.currentVersion,
        logger: this._logger,
      });
    if (docker && !this._docker)
      this._docker = new DockerAdapter({
        ...this._config.docker,
        logger: this._logger,
        keepImages: this._config.rollback.keepImages,
      });
    if (health && !this._health)
      this._health = new HealthAdapter({
        ...this._config.health,
        logger: this._logger,
      });
  }
}
