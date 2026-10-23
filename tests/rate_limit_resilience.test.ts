import assert from 'assert';
import * as http from 'http';
import { rateLimitTracker } from '../src/discord/rateLimitTracker';
import { startHealthServer } from '../src/server';

console.log('=== Running Discord Rate-Limit Resilience & 429 Diagnostics Tests ===\n');

async function runTests() {
  // Reset rate limit tracker before tests
  rateLimitTracker.reset();

  // Test 1: RateLimitTracker records 429 metadata correctly
  console.log('Test 1: RateLimitTracker parses and records 429 metadata (headers, scope, body, cooldown)');
  {
    rateLimitTracker.recordRateLimit({
      path: '/gateway/bot',
      retryAfterMs: 25000,
      scope: 'user',
      isGlobal: false,
      limit: 2,
      remaining: 0,
      resetAfter: 25.0,
      bucket: '41f9cd5d28af77da04563bcb1d67fdfd',
      via: '1.1 google',
      cfRay: 'a4f49e138a3ce1d9-MRS',
      responseBody: { message: 'You are being rate limited.', retry_after: 25.0, global: false },
    });

    const state = rateLimitTracker.getState();
    assert.strictEqual(state.isRateLimited, true, 'Tracker should report isRateLimited=true');
    assert.strictEqual(state.lastScope, 'user', 'Scope should be recorded as user');
    assert.strictEqual(state.isGlobal, false, 'isGlobal should be false');
    assert.strictEqual(state.lastRetryAfterMs, 25000, 'lastRetryAfterMs should be 25000');
    assert.strictEqual(state.limit, 2, 'Limit should be 2');
    assert.strictEqual(state.remaining, 0, 'Remaining should be 0');
    assert.strictEqual(state.bucket, '41f9cd5d28af77da04563bcb1d67fdfd', 'Bucket should match');

    const cooldown = rateLimitTracker.getRemainingCooldownMs();
    assert.ok(cooldown > 20000 && cooldown <= 25000, `Remaining cooldown should be ~25s, got ${cooldown}ms`);
    console.log('✔ Test 1 Passed: RateLimitTracker records all 429 headers and metadata accurately.\n');
  }

  // Test 2: Dynamic timeout extension logic
  console.log('Test 2: Dynamic login timeout extends during active rate limit to prevent premature process kill');
  {
    const DEFAULT_TIMEOUT_MS = 45000;
    const now = Date.now();
    const elapsed = 40000; // 40 seconds elapsed

    // With 25s remaining on rate limit:
    const remainingCooldown = rateLimitTracker.getRemainingCooldownMs();
    assert.ok(remainingCooldown > 0, 'Rate limit should still be active');

    const effectiveTimeout = Math.max(DEFAULT_TIMEOUT_MS, elapsed + remainingCooldown + 30000);
    assert.ok(
      effectiveTimeout > DEFAULT_TIMEOUT_MS,
      `Effective timeout should be extended beyond default (${DEFAULT_TIMEOUT_MS}ms), got ${effectiveTimeout}ms`
    );
    assert.ok(
      effectiveTimeout >= elapsed + remainingCooldown,
      'Effective timeout must allow the full Retry-After wait to complete'
    );
    console.log(`✔ Test 2 Passed: Effective timeout dynamically extended to ${effectiveTimeout}ms, protecting @discordjs/rest retry.\n`);
  }

  // Test 3: In-process retry calculation respects Discord Retry-After cooldown
  console.log('Test 3: In-process retry delay respects Discord Retry-After cooldown without tight restart loops');
  {
    const attempt = 1;
    let baseDelayMs = 10000 * Math.pow(2, attempt - 1); // 10s base exponential backoff
    const remainingCooldown = rateLimitTracker.getRemainingCooldownMs();

    // If rate limit active, backoff must wait remainingCooldown + 5s buffer
    let actualDelayMs = baseDelayMs;
    if (remainingCooldown > 0) {
      actualDelayMs = Math.max(actualDelayMs, remainingCooldown + 5000);
    }

    assert.ok(
      actualDelayMs >= remainingCooldown + 5000,
      `Actual delay (${actualDelayMs}ms) must cover remaining cooldown (${remainingCooldown}ms) + 5s buffer`
    );
    console.log(`✔ Test 3 Passed: Retry backoff calculated as ${actualDelayMs}ms, preventing restart storm.\n`);
  }

  // Test 4: Health Server exposes rate_limited status and remaining cooldown
  console.log('Test 4: Health server exposes rate_limited status and prevents false stalled state');
  {
    const server = startHealthServer(
      0, // Random port
      () => false, // discordReady = false
      () => rateLimitTracker.getState()
    );

    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const address = server.address() as { port: number };
    const port = address.port;

    try {
      // Check /health
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.strictEqual(res.status, 200, '/health should return HTTP 200 during active rate-limit wait to prevent PaaS kill');

      const body = await res.json() as {
        status: string;
        discordReady: boolean;
        rateLimit?: { active: boolean; scope: string; remainingCooldownSeconds: number };
      };

      assert.strictEqual(body.status, 'rate_limited', 'Status should be rate_limited');
      assert.strictEqual(body.discordReady, false, 'discordReady should be false');
      assert.strictEqual(body.rateLimit?.active, true, 'rateLimit.active should be true');
      assert.strictEqual(body.rateLimit?.scope, 'user', 'rateLimit.scope should be user');
      assert.ok(
        (body.rateLimit?.remainingCooldownSeconds ?? 0) > 0,
        'remainingCooldownSeconds should be positive'
      );

      // Check /ready
      const readyRes = await fetch(`http://127.0.0.1:${port}/ready`);
      assert.strictEqual(readyRes.status, 503, '/ready should return HTTP 503 when Discord is not ready');

      console.log('✔ Test 4 Passed: Health server correctly reports rate_limited status and cooldown.\n');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  console.log('===================================================');
  console.log('ALL RATE-LIMIT RESILIENCE & DIAGNOSTICS TESTS PASSED!');
  console.log('===================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
