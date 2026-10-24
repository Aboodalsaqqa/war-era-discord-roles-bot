import { logger } from '../utils/logger';

export interface RateLimitMetadata {
  isRateLimited: boolean;
  activeUntil: number; // Unix timestamp ms
  lastRetryAfterMs: number;
  lastScope: string | null; // 'user' | 'global' | 'shared' | null
  lastPath: string | null;
  isGlobal: boolean;
  limit: number | null;
  remaining: number | null;
  resetAfter: number | null;
  bucket: string | null;
  via: string | null;
  cfRay: string | null;
  lastEncounteredAt: number;
}

class DiscordRateLimitTracker {
  private state: RateLimitMetadata = {
    isRateLimited: false,
    activeUntil: 0,
    lastRetryAfterMs: 0,
    lastScope: null,
    lastPath: null,
    isGlobal: false,
    limit: null,
    remaining: null,
    resetAfter: null,
    bucket: null,
    via: null,
    cfRay: null,
    lastEncounteredAt: 0,
  };

  /**
   * Record a rate limit event with full header and body metadata
   */
  public recordRateLimit(params: {
    path: string;
    retryAfterMs: number;
    scope?: string | null;
    isGlobal?: boolean;
    limit?: number | null;
    remaining?: number | null;
    resetAfter?: number | null;
    bucket?: string | null;
    via?: string | null;
    cfRay?: string | null;
    responseBody?: unknown;
  }): void {
    const now = Date.now();
    const until = now + params.retryAfterMs;

    const isCloudflareIpBan = (!params.limit || params.limit === null) && params.retryAfterMs > 300000;
    const determinedScope = isCloudflareIpBan ? 'cloudflare_ip_ban' : (params.scope ?? 'unknown');

    this.state.isRateLimited = true;
    if (until > this.state.activeUntil) {
      this.state.activeUntil = until;
    }
    this.state.lastRetryAfterMs = params.retryAfterMs;
    this.state.lastScope = determinedScope;
    this.state.lastPath = params.path;
    this.state.isGlobal = params.isGlobal ?? false;
    this.state.limit = params.limit ?? null;
    this.state.remaining = params.remaining ?? null;
    this.state.resetAfter = params.resetAfter ?? null;
    this.state.bucket = params.bucket ?? null;
    this.state.via = params.via ?? null;
    this.state.cfRay = params.cfRay ?? null;
    this.state.lastEncounteredAt = now;

    if (isCloudflareIpBan) {
      logger.error(
        {
          cfRay: params.cfRay,
          retryAfterSeconds: Math.ceil(params.retryAfterMs / 1000),
          retryAfterHours: +(params.retryAfterMs / (1000 * 3600)).toFixed(2),
          activeUntil: new Date(until).toISOString(),
        },
        '[CLOUDFLARE_IP_BAN_DETECTED] Cloudflare edge ban detected on Render outbound IP. The IP is blocked by Cloudflare due to previous restart loops. To bypass immediately without waiting 17 hours, change the Render service Region (e.g. Oregon -> Frankfurt or Ohio) or suspend/resume the service in Render to acquire a fresh outbound IP.'
      );
    }

    logger.warn(
      {
        event: 'DISCORD_RATE_LIMIT_RECORDED',
        path: params.path,
        retryAfterMs: params.retryAfterMs,
        scope: params.scope ?? 'unknown',
        isGlobal: params.isGlobal ?? false,
        limit: params.limit,
        remaining: params.remaining,
        resetAfter: params.resetAfter,
        bucket: params.bucket,
        via: params.via,
        cfRay: params.cfRay,
        activeUntil: new Date(until).toISOString(),
        body: params.responseBody,
      },
      `[DISCORD_RATE_LIMIT] Recorded active Discord rate limit on ${params.path} (scope: ${params.scope ?? 'unknown'}, retryAfter: ${params.retryAfterMs}ms, global: ${params.isGlobal ?? false})`
    );
  }

  /**
   * Returns current rate limit status. Automatically clears if cooldown has expired.
   */
  public getState(): RateLimitMetadata {
    if (this.state.isRateLimited && Date.now() >= this.state.activeUntil) {
      this.state.isRateLimited = false;
    }
    return { ...this.state };
  }

  /**
   * Returns remaining cooldown in milliseconds (0 if not rate-limited)
   */
  public getRemainingCooldownMs(): number {
    const now = Date.now();
    if (!this.state.isRateLimited || now >= this.state.activeUntil) {
      this.state.isRateLimited = false;
      return 0;
    }
    return this.state.activeUntil - now;
  }

  /**
   * Reset the tracker (primarily used in tests)
   */
  public reset(): void {
    this.state = {
      isRateLimited: false,
      activeUntil: 0,
      lastRetryAfterMs: 0,
      lastScope: null,
      lastPath: null,
      isGlobal: false,
      limit: null,
      remaining: null,
      resetAfter: null,
      bucket: null,
      via: null,
      cfRay: null,
      lastEncounteredAt: 0,
    };
  }
}

export const rateLimitTracker = new DiscordRateLimitTracker();
