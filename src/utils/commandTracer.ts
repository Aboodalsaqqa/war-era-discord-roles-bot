import {
  ChatInputCommandInteraction,
  InteractionEditReplyOptions,
  MessagePayload,
} from 'discord.js';
import { logger } from './logger';

export interface TraceMetadata {
  [key: string]: string | number | boolean | undefined | null;
}

/**
 * Standard structured command tracer implementing the 10-point lifecycle tracing.
 *
 * Checkpoint 1: Process starts (logged in src/index.ts)
 * Checkpoint 2: Discord client logs in successfully (logged in src/index.ts)
 * Checkpoint 3: Discord ready event fires (logged in src/discord/client.ts)
 * Checkpoint 4: interactionCreate receives command (logged in src/discord/client.ts)
 * Checkpoint 5: Command router selects handler (logged in src/commands/index.ts)
 * Checkpoint 6: Handler starts (logged at handler entry)
 * Checkpoint 7: deferReply() starts (logged before interaction.deferReply())
 * Checkpoint 8: deferReply() completes or fails (durationMs, error details)
 * Checkpoint 9: Command work starts and finishes (stage, durationMs)
 * Checkpoint 10: editReply() succeeds or fails (durationMs, error details)
 */
export class CommandTracer {
  readonly correlationId: string;
  readonly commandName: string;
  readonly startTime: number;
  private readonly stageStarts: Map<string, number> = new Map();

  constructor(commandName: string, correlationId?: string) {
    this.commandName = commandName;
    this.correlationId =
      correlationId ||
      `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.startTime = Date.now();
  }

  checkpoint(checkpointNum: number, event: string, extra?: TraceMetadata): void {
    logger.info(
      {
        checkpoint: checkpointNum,
        event: `CHECKPOINT_${checkpointNum}_${event.toUpperCase()}`,
        correlationId: this.correlationId,
        commandName: this.commandName,
        elapsedFromStartMs: Date.now() - this.startTime,
        ...this.sanitizeMetadata(extra),
      },
      `[CHECKPOINT_${checkpointNum}_${event.toUpperCase()}] Command: /${this.commandName}`
    );
  }

  errorCheckpoint(
    checkpointNum: number,
    event: string,
    error: unknown,
    extra?: TraceMetadata
  ): void {
    const errMessage = error instanceof Error ? error.message : String(error);
    const errCode = (error as any)?.code;
    const errStatus = (error as any)?.status;
    const stack = error instanceof Error ? error.stack : undefined;

    logger.error(
      {
        checkpoint: checkpointNum,
        event: `CHECKPOINT_${checkpointNum}_${event.toUpperCase()}`,
        correlationId: this.correlationId,
        commandName: this.commandName,
        elapsedFromStartMs: Date.now() - this.startTime,
        error: errMessage,
        code: errCode,
        status: errStatus,
        stack,
        ...this.sanitizeMetadata(extra),
      },
      `[CHECKPOINT_${checkpointNum}_${event.toUpperCase()}] Command: /${this.commandName} failed`
    );
  }

  startStage(stage: string, extra?: TraceMetadata): void {
    this.stageStarts.set(stage, Date.now());
    this.checkpoint(9, `stage_${stage}_start`, extra);
  }

  endStage(stage: string, extra?: TraceMetadata): number {
    const started = this.stageStarts.get(stage);
    const durationMs = started !== undefined ? Date.now() - started : 0;
    this.stageStarts.delete(stage);
    this.checkpoint(9, `stage_${stage}_complete`, {
      stage,
      durationMs,
      ...extra,
    });
    return durationMs;
  }

  complete(outcome: string, extra?: TraceMetadata): number {
    const totalDurationMs = Date.now() - this.startTime;
    logger.info(
      {
        correlationId: this.correlationId,
        commandName: this.commandName,
        outcome,
        totalDurationMs,
        ...this.sanitizeMetadata(extra),
      },
      `[COMMAND_COMPLETE] Command: /${this.commandName} finished in ${totalDurationMs}ms (outcome: ${outcome})`
    );
    return totalDurationMs;
  }

  private sanitizeMetadata(metadata?: TraceMetadata): TraceMetadata | undefined {
    if (!metadata) return undefined;
    const sanitized: TraceMetadata = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined && value !== null) {
        if (/token|auth|key|secret/i.test(key)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = value;
        }
      }
    }
    return sanitized;
  }
}

/**
 * Safely defers a Discord interaction reply with proactive warning timer and error tracking.
 * Covers Checkpoint 7 (defer_start) and Checkpoint 8 (defer_result).
 * Returns true if deferred successfully, false if deferral failed.
 */
export async function safeDeferReply(
  interaction: ChatInputCommandInteraction,
  tracer: CommandTracer,
  options?: { ephemeral?: boolean }
): Promise<boolean> {
  const ephemeral = options?.ephemeral ?? false;
  tracer.checkpoint(7, 'defer_start', { ephemeral });
  const deferStart = Date.now();

  const warningTimer = setTimeout(() => {
    logger.warn(
      {
        correlationId: tracer.correlationId,
        commandName: tracer.commandName,
        elapsedMs: Date.now() - deferStart,
      },
      `[CHECKPOINT_7_DEFER_WARNING] interaction.deferReply() has exceeded 2000ms; Discord 3s gateway deadline at risk!`
    );
  }, 2000);

  try {
    await interaction.deferReply({ ephemeral });
    clearTimeout(warningTimer);
    tracer.checkpoint(8, 'defer_result', {
      status: 'success',
      durationMs: Date.now() - deferStart,
    });
    return true;
  } catch (err) {
    clearTimeout(warningTimer);
    tracer.errorCheckpoint(8, 'defer_result', err, {
      status: 'failed',
      durationMs: Date.now() - deferStart,
    });
    return false;
  }
}

/**
 * Safely edits the deferred reply with detailed latency and error tracking (Checkpoint 10).
 * Does not swallow errors silently — logs exact error message, Discord error code, and HTTP status.
 */
export async function safeEditReply(
  interaction: ChatInputCommandInteraction,
  tracer: CommandTracer,
  options: string | MessagePayload | InteractionEditReplyOptions
): Promise<boolean> {
  const replyStart = Date.now();
  try {
    await interaction.editReply(options);
    tracer.checkpoint(10, 'reply_result', {
      status: 'success',
      durationMs: Date.now() - replyStart,
    });
    return true;
  } catch (err) {
    tracer.errorCheckpoint(10, 'reply_result', err, {
      status: 'failed',
      durationMs: Date.now() - replyStart,
    });
    return false;
  }
}
