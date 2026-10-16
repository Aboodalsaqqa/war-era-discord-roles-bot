import { logger } from './logger';

export interface ProfileTraceMetadata {
  [key: string]: string | number | boolean | undefined | null;
}

/**
 * Structured diagnostic tracer for the /profile command lifecycle.
 * Emits uniform log lines in the format:
 * [PROFILE_TRACE] requestId=... stage=... event=start|complete|error durationMs=...
 */
export class ProfileTracer {
  readonly requestId: string;
  readonly startTime: number;
  private readonly stageStarts: Map<string, number> = new Map();

  constructor(requestId?: string) {
    this.requestId = requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.startTime = Date.now();
  }

  private formatMetadata(metadata?: ProfileTraceMetadata): string {
    if (!metadata) return '';
    const parts: string[] = [];
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined && value !== null) {
        // Redact any potential sensitive tokens or credentials
        const strVal = String(value);
        const sanitized = /token|auth|key|secret/i.test(key) ? '[REDACTED]' : strVal;
        parts.push(`${key}=${sanitized}`);
      }
    }
    return parts.length > 0 ? ' ' + parts.join(' ') : '';
  }

  startStage(stage: string, metadata?: ProfileTraceMetadata): void {
    this.stageStarts.set(stage, Date.now());
    const metaStr = this.formatMetadata(metadata);
    logger.info(`[PROFILE_TRACE] requestId=${this.requestId} stage=${stage} event=start${metaStr}`);
  }

  endStage(stage: string, metadata?: ProfileTraceMetadata): number {
    const started = this.stageStarts.get(stage);
    const durationMs = started !== undefined ? Date.now() - started : 0;
    this.stageStarts.delete(stage);
    const metaStr = this.formatMetadata(metadata);
    logger.info(`[PROFILE_TRACE] requestId=${this.requestId} stage=${stage} event=complete durationMs=${durationMs}${metaStr}`);
    return durationMs;
  }

  errorStage(stage: string, error: Error | unknown, metadata?: ProfileTraceMetadata): number {
    const started = this.stageStarts.get(stage);
    const durationMs = started !== undefined ? Date.now() - started : 0;
    this.stageStarts.delete(stage);
    const errMessage = error instanceof Error ? error.message : String(error);
    const metaStr = this.formatMetadata(metadata);
    logger.error(
      `[PROFILE_TRACE] requestId=${this.requestId} stage=${stage} event=error durationMs=${durationMs} error="${errMessage}"${metaStr}`
    );
    return durationMs;
  }

  complete(metadata?: ProfileTraceMetadata): number {
    const totalDurationMs = Date.now() - this.startTime;
    const metaStr = this.formatMetadata(metadata);
    logger.info(`[PROFILE_TRACE] requestId=${this.requestId} stage=total event=complete durationMs=${totalDurationMs}${metaStr}`);
    return totalDurationMs;
  }
}
