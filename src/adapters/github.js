import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { GitHubError, RateLimitError } from "../utils/errors.js";
import { createLogger, silentLogger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";

/** @typedef {{ remaining: number | null, limit: number | null, resetAt: string | null } | null} RateLimitInfo */
/** @typedef {{ updateAvailable: boolean, currentVersion: string, currentVersionRaw: string, latestVersion: string | null, latestVersionRaw: string | null, releaseUrl: string | null, releaseNotes: string | null, publishedAt: string | null, isPrerelease: boolean, fromCache: boolean, rateLimit: RateLimitInfo }} GitHubCheckResult */
/** @typedef {{ repo?: string, currentVersion?: string, token?: string, includePrerelease?: boolean, cacheFile?: string, cacheTTL?: number, logger?: Object, fetchImpl?: typeof fetch, baseUrl?: string }} GitHubAdapterOptions */
/** @typedef {Error & { retryable?: boolean, status?: number }} RetryableError */

const VERSION_PATTERN =
  /^(?:v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?|[a-fA-F0-9]{7,40})$/;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const RATE_HEADERS = [
  "x-ratelimit-remaining",
  "x-ratelimit-limit",
  "x-ratelimit-reset",
];

function parseRateLimit(headers) {
  const values = RATE_HEADERS.map((name) => headers?.get?.(name));
  if (values.every((value) => value === null || value === undefined))
    return null;
  const remaining = values[0] == null ? null : Number(values[0]);
  const limit = values[1] == null ? null : Number(values[1]);
  const reset = values[2] == null ? NaN : Number(values[2]);
  const resetDate = new Date(reset * 1000);
  return {
    remaining: Number.isFinite(remaining) ? remaining : null,
    limit: Number.isFinite(limit) ? limit : null,
    resetAt: Number.isFinite(resetDate.getTime())
      ? resetDate.toISOString()
      : null,
  };
}

function makeRetryableError(message, cause, status) {
  const error = /** @type {RetryableError} */ (
    new Error(message, cause === undefined ? undefined : { cause })
  );
  error.retryable = true;
  if (status !== undefined) error.status = status;
  return error;
}

function isRetryable(error) {
  return (
    error instanceof Error &&
    /** @type {RetryableError} */ (error).retryable === true
  );
}

/**
 * Read GitHub Releases and determine whether a newer version is available.
 * @example
 * const github = new GitHubAdapter({ repo: "acme/app", currentVersion: "1.2.3" });
 * const result = await github.check();
 */
export class GitHubAdapter {
  /**
   * Create a GitHub Releases adapter.
   * @param {GitHubAdapterOptions} options Repository, running version, and optional transport/cache settings.
   * @example
   * new GitHubAdapter({ repo: "acme/app", currentVersion: "1.2.3", token: process.env.GITHUB_TOKEN });
   */
  constructor({
    repo,
    currentVersion,
    token,
    includePrerelease = false,
    cacheFile = ".update-cache.json",
    cacheTTL = 300_000,
    logger = silentLogger,
    fetchImpl = globalThis.fetch,
    baseUrl = "https://api.github.com",
  } = {}) {
    if (typeof repo !== "string" || !REPO_PATTERN.test(repo))
      throw new GitHubError("repo must be in 'owner/repo' format");
    if (
      typeof currentVersion !== "string" ||
      !VERSION_PATTERN.test(currentVersion.trim())
    )
      throw new GitHubError(
        "currentVersion must be a semver string or git SHA",
      );
    if (
      typeof cacheFile !== "string" ||
      !cacheFile ||
      !Number.isFinite(cacheTTL) ||
      cacheTTL < 0
    )
      throw new GitHubError("Invalid cache configuration");
    if (typeof fetchImpl !== "function")
      throw new GitHubError("fetchImpl must be a function");
    if (typeof logger?.warn !== "function") {
      try {
        logger = createLogger(/** @type {any} */ (logger ?? {}));
      } catch (error) {
        throw new GitHubError("Invalid logger configuration", { cause: error });
      }
    }
    this.repo = repo;
    this.currentVersionRaw = currentVersion;
    this.currentVersion = this._normalizeVersion(currentVersion);
    this.token = token;
    this.includePrerelease = includePrerelease;
    this.cacheFile = cacheFile;
    this.cacheTTL = cacheTTL;
    this.logger = logger;
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.rateLimit = null;
  }

  /**
   * Check the latest eligible release against the configured running version.
   * @returns {Promise<GitHubCheckResult>} Release comparison, notes, cache, and rate-limit details.
   * @example
   * const { updateAvailable, latestVersion } = await github.check();
   */
  async check() {
    const { releases, rateLimit, fromCache } = await this._loadReleases();
    const release = this._pickRelease(releases);
    const latestVersionRaw = release ? String(release.tag_name) : null;
    const latestVersion =
      latestVersionRaw === null
        ? null
        : this._normalizeVersion(latestVersionRaw);
    const updateAvailable =
      latestVersionRaw !== null &&
      (this._isSha(this.currentVersion) || this._isSha(latestVersionRaw)
        ? latestVersionRaw !== this.currentVersionRaw
        : this._compareVersions(latestVersion, this.currentVersion) > 0);
    const published = release?.published_at;
    const publishedTime = published ? Date.parse(published) : NaN;
    return {
      updateAvailable,
      currentVersion: this.currentVersion,
      currentVersionRaw: this.currentVersionRaw,
      latestVersion,
      latestVersionRaw,
      releaseUrl: release?.html_url ?? null,
      releaseNotes: typeof release?.body === "string" ? release.body : null,
      publishedAt: Number.isFinite(publishedTime)
        ? new Date(publishedTime).toISOString()
        : null,
      isPrerelease: release?.prerelease === true,
      fromCache,
      rateLimit,
    };
  }

  /**
   * Return the raw latest release eligible under this adapter's prerelease policy.
   * @returns {Promise<Object | null>} Raw GitHub release or null when no eligible release exists.
   * @example
   * const release = await github.getLatestRelease();
   */
  async getLatestRelease() {
    const { releases } = await this._loadReleases();
    return this._pickRelease(releases);
  }

  /**
   * Delete the configured cache file without throwing.
   * @returns {Promise<boolean>} True when a file was removed, otherwise false.
   * @example
   * const removed = await github.clearCache();
   */
  async clearCache() {
    try {
      await unlink(this.cacheFile);
      return true;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        try {
          this.logger.warn("Could not clear GitHub release cache", {
            cacheFile: this.cacheFile,
            error: error.message,
          });
        } catch {
          // Cache removal must remain non-throwing.
        }
      }
      return false;
    }
  }

  async _loadReleases() {
    const cached = await this._readCache();
    if (cached.valid) {
      this._assertRateLimit(cached.data.rateLimit);
      return {
        releases: cached.data.releases,
        rateLimit: cached.data.rateLimit,
        fromCache: true,
      };
    }
    const { releases, rateLimit } = await this._fetchReleases();
    this._assertRateLimit(rateLimit);
    await this._writeCache({
      repo: this.repo,
      baseUrl: this.baseUrl,
      includePrerelease: this.includePrerelease,
      cachedAt: Date.now(),
      releases,
      rateLimit,
    });
    return { releases, rateLimit, fromCache: false };
  }

  async _fetchReleases() {
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "update-pilot/0.0.1",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const url = `${this.baseUrl}/repos/${this.repo}/releases?per_page=10`;
    const request = async () => {
      let response;
      try {
        response = await this.fetchImpl(url, { method: "GET", headers });
      } catch (error) {
        throw makeRetryableError("GitHub network request failed", error);
      }
      const rateLimit = parseRateLimit(response.headers);
      this.rateLimit = rateLimit;
      if (rateLimit?.remaining === 0) this._assertRateLimit(rateLimit);
      if (response.status === 404)
        throw new GitHubError(
          `Repository ${this.repo} not found or has no releases`,
          { context: { repo: this.repo, status: 404 } },
        );
      if (response.status === 401)
        throw new GitHubError(
          "GitHub authentication failed — check your token",
          { context: { repo: this.repo, status: 401 } },
        );
      if (response.status >= 500)
        throw makeRetryableError(
          `GitHub API returned ${response.status}`,
          undefined,
          response.status,
        );
      if (!response.ok)
        throw new GitHubError(
          `GitHub API request failed with status ${response.status}`,
          { context: { repo: this.repo, status: response.status } },
        );
      let data;
      try {
        data = await response.json();
      } catch (error) {
        throw new GitHubError("Invalid JSON response from GitHub", {
          cause: error,
          context: { repo: this.repo, status: response.status },
        });
      }
      if (!Array.isArray(data))
        throw new GitHubError("Invalid release list response from GitHub", {
          context: { repo: this.repo },
        });
      return { releases: data, rateLimit };
    };
    try {
      return await retry(request, { retries: 3, shouldRetry: isRetryable });
    } catch (error) {
      if (error instanceof GitHubError || error instanceof RateLimitError)
        throw error;
      const retryError =
        error instanceof Error
          ? /** @type {RetryableError} */ (error)
          : undefined;
      throw new GitHubError("GitHub Releases request failed", {
        cause: retryError?.cause ?? error,
        context: { repo: this.repo, status: retryError?.status },
      });
    }
  }

  async _readCache() {
    try {
      const data = JSON.parse(await readFile(this.cacheFile, "utf8"));
      const rateLimit = data?.rateLimit;
      const validRateLimit =
        rateLimit === null ||
        (rateLimit &&
          typeof rateLimit === "object" &&
          [rateLimit.remaining, rateLimit.limit].every(
            (value) => value === null || Number.isFinite(value),
          ) &&
          (rateLimit.resetAt === null ||
            (typeof rateLimit.resetAt === "string" &&
              Number.isFinite(Date.parse(rateLimit.resetAt)))));
      const valid =
        this.cacheTTL > 0 &&
        data?.repo === this.repo &&
        data?.baseUrl === this.baseUrl &&
        data?.includePrerelease === this.includePrerelease &&
        Array.isArray(data?.releases) &&
        data.releases.every(
          (release) =>
            release &&
            typeof release === "object" &&
            typeof release.tag_name === "string",
        ) &&
        Number.isFinite(data?.cachedAt) &&
        Date.now() - data.cachedAt < this.cacheTTL &&
        validRateLimit;
      return { data, valid };
    } catch {
      return { data: null, valid: false };
    }
  }

  async _writeCache(data) {
    try {
      await mkdir(dirname(this.cacheFile), { recursive: true });
      await writeFile(this.cacheFile, JSON.stringify(data), { mode: 0o600 });
      await chmod(this.cacheFile, 0o600);
    } catch (error) {
      try {
        this.logger.warn("Could not write GitHub release cache", {
          cacheFile: this.cacheFile,
          error: error.message,
        });
      } catch {
        // Cache writes and their warning logs are best-effort.
      }
    }
  }

  _assertRateLimit(rateLimit) {
    if (rateLimit?.remaining !== 0) return;
    throw new RateLimitError(`GitHub rate limit exceeded for ${this.repo}`, {
      context: { repo: this.repo, resetAt: rateLimit.resetAt },
    });
  }

  _pickRelease(releases) {
    return (
      releases
        .filter(
          (release) =>
            release &&
            typeof release.tag_name === "string" &&
            release.tag_name.length > 0 &&
            release.draft !== true &&
            (this.includePrerelease || release.prerelease !== true),
        )
        .sort(
          (a, b) =>
            (Date.parse(b.published_at ?? "") || 0) -
            (Date.parse(a.published_at ?? "") || 0),
        )[0] ?? null
    );
  }

  _compareVersions(a, b) {
    const parse = (value) => {
      const match = this._normalizeVersion(value).match(
        /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/,
      );
      return (
        match && {
          core: match.slice(1, 4).map(Number),
          pre: match[4]?.split(".") ?? null,
        }
      );
    };
    if (this._isSha(a) || this._isSha(b)) return a === b ? 0 : 1;
    const left = parse(a);
    const right = parse(b);
    if (!left || !right) return a === b ? 0 : a.localeCompare(b) < 0 ? -1 : 1;
    for (let i = 0; i < 3; i += 1)
      if (left.core[i] !== right.core[i])
        return left.core[i] < right.core[i] ? -1 : 1;
    if (left.pre === null || right.pre === null)
      return left.pre === right.pre ? 0 : left.pre === null ? 1 : -1;
    for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i += 1) {
      const x = left.pre[i];
      const y = right.pre[i];
      if (x === undefined || y === undefined)
        return x === y ? 0 : x === undefined ? -1 : 1;
      if (x === y) continue;
      const xn = /^\d+$/.test(x);
      const yn = /^\d+$/.test(y);
      if (xn && yn) return Number(x) < Number(y) ? -1 : 1;
      if (xn !== yn) return xn ? -1 : 1;
      return x < y ? -1 : 1;
    }
    return 0;
  }

  _normalizeVersion(version) {
    return version.trim().replace(/^v/, "");
  }

  _isSha(version) {
    return /^[0-9a-f]{7,40}$/i.test(version);
  }
}
