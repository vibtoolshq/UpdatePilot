declare module "update-pilot" {
  export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

  export interface LoggerConfig {
    level?: LogLevel;
    prefix?: string;
    pretty?: boolean;
    stream?: { write(chunk: string): unknown };
    redact?: string[];
  }

  export interface Logger {
    error(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    debug(message: string, meta?: Record<string, unknown>): void;
    child(bindings?: Record<string, unknown>): Logger;
  }

  export interface GitHubConfig {
    token?: string;
    includePrerelease?: boolean;
    cacheFile?: string;
    cacheTTL?: number;
  }

  export interface ResolvedGitHubConfig {
    token: string | undefined;
    includePrerelease: boolean;
    cacheFile: string;
    cacheTTL: number;
  }

  export interface DockerConfig {
    image: string;
    tag?: string;
    composeFile?: string;
    containerName?: string;
    socketPath?: string;
  }

  export interface ResolvedDockerConfig {
    image: string;
    tag: string;
    composeFile: string | undefined;
    containerName: string;
    socketPath: string;
  }

  export interface HealthConfig {
    url: string;
    retries?: number;
    timeout?: number;
    interval?: number;
    expectStatus?: number;
    headers?: Record<string, string>;
  }

  export interface ResolvedHealthConfig {
    url: string;
    retries: number;
    timeout: number;
    interval: number;
    expectStatus: number;
    headers: Record<string, string>;
  }

  export interface RollbackConfig {
    enabled?: boolean;
    keepImages?: number;
  }

  export interface ResolvedRollbackConfig {
    enabled: boolean;
    keepImages: number;
  }

  export interface BeforeCheckPayload {
    currentVersion: string;
  }
  export interface AfterCheckPayload {
    result: CheckResult;
  }
  export interface BeforeDeployPayload {
    from: string;
    to: string | null;
  }
  export interface AfterDeployPayload {
    from: string;
    to: string | null;
    deployResult: DockerDeployResult;
    durationMs: number;
  }
  export interface BeforeVerifyPayload {
    url: string;
  }
  export interface AfterVerifyPayload {
    healthResult: HealthResult;
  }
  export interface BeforeRollbackPayload {
    reason: string;
    healthError?: HealthCheckError;
    to?: string;
  }
  export interface AfterRollbackPayload {
    success: boolean;
    manual?: boolean;
  }
  export type OnErrorPayload = UpdatePilotError;

  export type HookHandler<T = unknown> = (
    payload: T,
  ) => unknown | Promise<unknown>;
  export interface HooksConfig {
    beforeCheck?: HookHandler<BeforeCheckPayload>;
    afterCheck?: HookHandler<AfterCheckPayload>;
    beforeDeploy?: HookHandler<BeforeDeployPayload>;
    afterDeploy?: HookHandler<AfterDeployPayload>;
    beforeVerify?: HookHandler<BeforeVerifyPayload>;
    afterVerify?: HookHandler<AfterVerifyPayload>;
    beforeRollback?: HookHandler<BeforeRollbackPayload>;
    afterRollback?: HookHandler<AfterRollbackPayload>;
    onError?: HookHandler<OnErrorPayload>;
  }

  export interface UserConfig {
    repo: string;
    currentVersion: string;
    github?: GitHubConfig;
    docker: DockerConfig;
    health: HealthConfig;
    rollback?: RollbackConfig;
    hooks?: HooksConfig;
    logger?: LoggerConfig;
  }

  export interface ResolvedConfig {
    repo: string;
    currentVersion: string;
    currentVersionRaw: string;
    github: ResolvedGitHubConfig;
    docker: ResolvedDockerConfig;
    health: ResolvedHealthConfig;
    rollback: ResolvedRollbackConfig;
    hooks: HooksConfig;
    logger: Logger;
  }

  export interface CheckResult {
    updateAvailable: boolean;
    currentVersion: string;
    currentVersionRaw: string;
    latestVersion: string | null;
    latestVersionRaw: string | null;
    releaseUrl: string | null;
    releaseNotes: string | null;
    publishedAt: string | null;
    isPrerelease: boolean;
    fromCache: boolean;
    rateLimit: {
      remaining: number | null;
      limit: number | null;
      resetAt: string | null;
    } | null;
  }

  export interface UpToDateResult {
    status: "up-to-date";
    currentVersion: string;
    latestVersion: string | null;
    checkedAt: string;
  }
  export interface UpdatedResult {
    status: "updated";
    from: string;
    to: string | null;
    newContainerId: string | null;
    healthLatencyMs: number;
    durationMs: number;
    checkedAt: string;
  }
  export interface RolledBackResult {
    status: "rolled-back";
    reason: "health-check-failed";
    from: string;
    to: string | null;
    healthError: { message: string; context: Record<string, unknown> };
    durationMs: number;
  }
  export interface DryRunResult {
    status: "dry-run";
    wouldDeploy: { from: string; to: string | null };
    checkedAt: string;
  }
  export interface ManualRollbackResult {
    status: "rolled-back-manual";
    to: string;
  }
  export type UpdateResult =
    | UpToDateResult
    | UpdatedResult
    | RolledBackResult
    | DryRunResult
    | ManualRollbackResult;

  export interface EngineStatus {
    running: boolean;
    lastResult: UpdateResult | null;
    currentVersion: string;
    repo: string;
    uptime: { startedAt: string; engineSince: string };
  }

  export interface HealthResult {
    healthy: true;
    url: string;
    status: number;
    attempts: number;
    latencyMs: number;
    checkedAt: string;
  }
  /** Deployment data supplied to a provider for one Docker candidate update. */
  export interface TrafficRouterDeployment {
    from: string;
    to: string | null;
    /** Live health endpoint for an injected router; adapter-owned handoff may override it. */
    healthUrl: string;
    previousContainerId: string | null;
    newContainerId: string | null;
    candidatePorts: Record<string, Array<{ HostIp: string; HostPort: string }>>;
  }
  /** Candidate-only health endpoint and opaque state returned by prepare(). */
  export interface TrafficRouterPreparation {
    healthUrl: string;
    context?: unknown;
  }
  /**
   * Provider contract for switching traffic to a healthy Docker candidate.
   * The old route must remain active until switch() is called.
   */
  export interface TrafficRouter {
    /**
     * Prepare candidate routing without changing the live route. Return an
     * absolute HTTP(S) candidate-only health URL distinct from deployment.healthUrl.
     * Clean partial work before rejecting; the engine also attempts rollback
     * with undefined context when preparation rejects before returning state.
     */
    prepare(
      deployment: TrafficRouterDeployment,
    ): Promise<TrafficRouterPreparation>;
    /** Resolve only after the candidate route is active; reject on partial failure. */
    switch(
      deployment: TrafficRouterDeployment,
      context?: unknown,
    ): Promise<void>;
    /**
     * Restore the prior route and clear prepared state. This must be idempotent,
     * including repeated recovery calls and calls with undefined context. If
     * there is no prior route, ensure the candidate is not routed.
     */
    rollback(
      deployment: TrafficRouterDeployment,
      context?: unknown,
      reason?: string,
    ): Promise<void>;
  }
  export interface DockerDeployResult {
    success: true;
    newContainerId: string | null;
    previousContainerId: string | null;
    /** Candidate health endpoint when a custom Docker adapter owns handoff. */
    healthUrl?: string;
    candidatePorts?: Record<
      string,
      Array<{ HostIp: string; HostPort: string }>
    >;
  }
  export interface DockerFinalizeResult {
    finalized: true;
  }
  export interface DockerRollbackResult {
    rolledBack: true;
    restoredContainerId: string | null;
  }

  export interface ErrorOptions {
    code?: string;
    cause?: unknown;
    context?: Record<string, unknown>;
  }
  export class UpdatePilotError extends Error {
    code: string;
    context: Record<string, unknown>;
    cause: unknown;
    constructor(message: string, options?: ErrorOptions);
    toJSON(): {
      name: string;
      code: string;
      message: string;
      context: Record<string, unknown>;
      stack: string | undefined;
    };
  }
  export class ConfigError extends UpdatePilotError {
    constructor(message: string, options?: ErrorOptions);
  }
  export class GitHubError extends UpdatePilotError {
    constructor(message: string, options?: ErrorOptions);
  }
  export class DockerError extends UpdatePilotError {
    constructor(message: string, options?: ErrorOptions);
  }
  export class HealthCheckError extends UpdatePilotError {
    constructor(message: string, options?: ErrorOptions);
  }
  export class RollbackError extends UpdatePilotError {
    constructor(message: string, options?: ErrorOptions);
  }
  export class UpdateInProgressError extends UpdatePilotError {
    constructor(message: string, options?: ErrorOptions);
  }
  export class RateLimitError extends UpdatePilotError {
    constructor(message: string, options?: ErrorOptions);
  }
  export function isUpdatePilotError(error: unknown): error is UpdatePilotError;

  export class HookBus {
    constructor();
    on(event: string, handler: HookHandler): this;
    off(event: string, handler: HookHandler): this;
    once(event: string, handler: HookHandler): this;
    emit(event: string, payload: unknown): Promise<unknown[]>;
    emitSafe(
      event: string,
      payload: unknown,
    ): Promise<{ results: unknown[]; errors: unknown[] }>;
    clear(): void;
    listenerCount(event: string): number;
  }
  export const HOOKS: Readonly<{
    BEFORE_CHECK: "beforeCheck";
    AFTER_CHECK: "afterCheck";
    BEFORE_DEPLOY: "beforeDeploy";
    AFTER_DEPLOY: "afterDeploy";
    BEFORE_VERIFY: "beforeVerify";
    AFTER_VERIFY: "afterVerify";
    BEFORE_ROLLBACK: "beforeRollback";
    AFTER_ROLLBACK: "afterRollback";
    ON_ERROR: "onError";
  }>;

  export interface GitHubAdapterOptions {
    repo: string;
    currentVersion: string;
    token?: string;
    includePrerelease?: boolean;
    cacheFile?: string;
    cacheTTL?: number;
    logger?: Logger;
    fetchImpl?: (
      url: string,
      options: { method: string; headers: Record<string, string> },
    ) => Promise<unknown>;
    baseUrl?: string;
  }
  export interface DockerAdapterOptions {
    image: string;
    tag?: string;
    containerName?: string;
    composeFile?: string;
    socketPath?: string;
    logger?: Logger;
    dockerClient?: unknown;
    dockerComposeClient?: unknown;
    keepImages?: number;
  }
  export interface HealthAdapterOptions {
    url: string;
    retries?: number;
    timeout?: number;
    interval?: number;
    expectStatus?: number;
    headers?: Record<string, string>;
    logger?: Logger;
    fetchImpl?: (
      url: string,
      options: {
        method: string;
        headers: Record<string, string>;
        signal: AbortSignal;
        redirect: "manual";
      },
    ) => Promise<{ status: number }>;
    sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>;
  }
  export interface UpdatePilotDependencies {
    githubAdapter?: Pick<GitHubAdapter, "check">;
    dockerAdapter?: Pick<DockerAdapter, "deploy" | "finalize" | "rollback"> &
      Partial<Pick<DockerAdapter, "restorePrevious">>;
    healthAdapter?: Pick<HealthAdapter, "check">;
    trafficRouter?: TrafficRouter;
    logger?: Logger;
    hookBus?: HookBus;
  }
  export class UpdatePilot {
    constructor(userConfig: UserConfig, deps?: UpdatePilotDependencies);
    readonly config: ResolvedConfig;
    readonly logger: Logger;
    readonly hooks: HookBus;
    checkOnly(): Promise<CheckResult>;
    runUpdate(options?: {
      dryRun?: boolean;
      force?: boolean;
    }): Promise<UpdateResult>;
    getStatus(): EngineStatus;
    rollback(): Promise<ManualRollbackResult>;
  }
  export function defineConfig(config: UserConfig): ResolvedConfig;
  export function validateConfig(config: ResolvedConfig): true;

  export class GitHubAdapter {
    constructor(options: GitHubAdapterOptions);
    check(): Promise<CheckResult>;
    getLatestRelease(): Promise<Record<string, unknown> | null>;
    clearCache(): Promise<boolean>;
  }
  export class DockerAdapter {
    constructor(options: DockerAdapterOptions);
    pull(tag?: string): Promise<{ pulled: true; image: string }>;
    getCurrentContainer(): Promise<{
      id: string;
      name: string;
      image: string;
      state: string;
      status: string;
    } | null>;
    deploy(newTag?: string): Promise<DockerDeployResult>;
    finalize(): Promise<DockerFinalizeResult>;
    restorePrevious(): Promise<{ restoredContainerId: string | null }>;
    rollback(originalError?: Error): Promise<DockerRollbackResult>;
  }
  export class HealthAdapter {
    constructor(options: HealthAdapterOptions);
    check(options?: {
      signal?: AbortSignal;
      url?: string;
    }): Promise<HealthResult>;
    checkOnce(options?: {
      signal?: AbortSignal;
      url?: string;
    }): Promise<HealthResult>;
    waitUntilHealthy(options?: {
      signal?: AbortSignal;
      url?: string;
    }): Promise<HealthResult>;
  }
  export function createLogger(options?: LoggerConfig): Logger;
  export const silentLogger: Logger;
  export const VERSION: "0.0.1";
}

declare module "update-pilot/adapters/docker" {
  export { DockerAdapter } from "update-pilot";
}

declare module "update-pilot/adapters/github" {
  export { GitHubAdapter } from "update-pilot";
}

declare module "update-pilot/adapters/health" {
  export { HealthAdapter } from "update-pilot";
}

declare module "update-pilot/testing/traffic-router-contract" {
  import type {
    TrafficRouter,
    TrafficRouterDeployment,
    TrafficRouterPreparation,
  } from "update-pilot";

  export interface TrafficRouterContractScenario {
    trafficRouter: TrafficRouter;
    deployment: TrafficRouterDeployment;
    verifyCandidateHealth(
      preparation: TrafficRouterPreparation,
      deployment: TrafficRouterDeployment,
    ): void | Promise<void>;
    assertOldRouteActive(): void | Promise<void>;
    assertCandidateRouteActive(): void | Promise<void>;
    assertPreparationCleaned(): void | Promise<void>;
    cleanup(): void | Promise<void>;
  }

  export interface TrafficRouterContractTestOptions {
    providerName: string;
    createScenario():
      | TrafficRouterContractScenario
      | Promise<TrafficRouterContractScenario>;
  }

  export function defineTrafficRouterContractTests(
    options: TrafficRouterContractTestOptions,
  ): void;
}
