import assert from 'assert';
import * as http from 'http';
import { Client, GatewayIntentBits, ChatInputCommandInteraction } from 'discord.js';
import { rateLimitTracker, redactDiscordPath, shouldRejectOnRateLimit } from '../src/discord/rateLimitTracker';
import { CommandTracer, safeDeferReply } from '../src/utils/commandTracer';

const FAKE_TOKEN = 'aW50ZXJhY3Rpb246ZmFrZTp0b2tlbg';
const CALLBACK_PATH = `/interactions/1569500067881029652/${FAKE_TOKEN}/callback`;

function makeInteraction(client: Client): ChatInputCommandInteraction {
  const Ctor = ChatInputCommandInteraction as any;
  return new Ctor(client, {
    id: '1569500067881029652',
    application_id: '111111111111111111',
    type: 2,
    token: FAKE_TOKEN,
    version: 1,
    channel_id: '222222222222222222',
    locale: 'en-US',
    entitlements: [],
    user: { id: '333333333333333333', username: 'tester', discriminator: '0', global_name: 'tester', avatar: null },
    data: { id: '444444444444444444', name: 'profile', type: 1, options: [] },
    authorizing_integration_owners: {},
    attachment_size_limit: 1,
  });
}

async function runTests() {
  console.log('=== Running Interaction Rate-Limit (Cloudflare 429) Tests ===\n');

  // Test 1
  console.log('Test 1: Interaction and webhook tokens are redacted from paths');
  assert.strictEqual(redactDiscordPath(CALLBACK_PATH), '/interactions/1569500067881029652/[REDACTED]/callback');
  assert.strictEqual(
    redactDiscordPath(`https://discord.com/api/v10/webhooks/111111111111111111/${FAKE_TOKEN}/messages/@original`),
    'https://discord.com/api/v10/webhooks/111111111111111111/[REDACTED]/messages/@original'
  );
  assert.strictEqual(redactDiscordPath('/guilds/1087744522785669231/members/333333333333333333'), '/guilds/1087744522785669231/members/333333333333333333');
  console.log('✔ Test 1 Passed: Tokens redacted; unrelated routes untouched.\n');

  // Test 2
  console.log('Test 2: Tracker never stores a raw interaction token');
  rateLimitTracker.reset();
  rateLimitTracker.recordRateLimit({ path: CALLBACK_PATH, retryAfterMs: 60368000 });
  const state = rateLimitTracker.getState();
  assert.ok(state.lastPath && !state.lastPath.includes(FAKE_TOKEN), 'lastPath must not contain the token');
  assert.strictEqual(state.lastScope, 'cloudflare_ip_ban');
  rateLimitTracker.reset();
  console.log('✔ Test 2 Passed: Stored path is redacted.\n');

  // Test 3
  console.log('Test 3: Only interaction response routes reject on rate limit');
  assert.strictEqual(shouldRejectOnRateLimit('/interactions/:id/:token/callback'), true);
  assert.strictEqual(shouldRejectOnRateLimit('/webhooks/:id/:token/messages/@original'), true);
  assert.strictEqual(shouldRejectOnRateLimit('/gateway/bot'), false, 'login must keep waiting out its Retry-After');
  assert.strictEqual(shouldRejectOnRateLimit('/guilds/:id/members/:id'), false);
  console.log('✔ Test 3 Passed: Reject predicate scoped correctly.\n');

  // Test 4
  console.log('Test 4: deferReply fails fast when the callback is answered with a Cloudflare-style 429');
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits++;
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '60368' });
    res.end(JSON.stringify({ message: 'blocked', retry_after: 60368, global: false }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const api = `http://127.0.0.1:${(server.address() as any).port}`;

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    rest: {
      api,
      timeout: 15000,
      retries: 2,
      rejectOnRateLimit: (d) => shouldRejectOnRateLimit(d.route),
    },
  });
  client.rest.setToken('mock.mock.mock');

  const interaction = makeInteraction(client);
  const started = Date.now();
  const outcome = await Promise.race([
    safeDeferReply(interaction, new CommandTracer('profile')),
    new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 5000)),
  ]);
  const elapsed = Date.now() - started;

  assert.notStrictEqual(outcome, 'hung', 'deferReply must not sleep for Retry-After');
  assert.strictEqual(outcome, false, 'safeDeferReply should report failure');
  assert.ok(elapsed < 2000, `expected fast failure, took ${elapsed}ms`);
  assert.strictEqual(hits, 1, 'exactly one HTTP attempt, no retry storm');
  assert.strictEqual(interaction.deferred, false);

  await client.destroy();
  (server as any).closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  console.log(`✔ Test 4 Passed: Failed fast in ${elapsed}ms with a single request.\n`);

  console.log('===================================================');
  console.log('ALL INTERACTION RATE-LIMIT TESTS PASSED!');
  console.log('===================================================');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('TEST FAILED:', err);
    process.exit(1);
  });
