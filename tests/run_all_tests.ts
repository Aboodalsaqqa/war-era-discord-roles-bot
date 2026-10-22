import { spawnSync } from 'child_process';
import path from 'path';

interface TestSuite {
  name: string;
  file: string;
  testCount: number;
}

const suites: TestSuite[] = [
  { name: 'Profile Diagnostics & Timeout Guard', file: 'profile_diagnostics.test.ts', testCount: 6 },
  { name: 'Forceverify Permission Enforcement', file: 'forceverify_permissions.test.ts', testCount: 7 },
  { name: 'Command Routing & Lifecycle Verification', file: 'command_routing_lifecycle.test.ts', testCount: 5 },
  { name: 'Role Synchronization & Corps Logic', file: 'role_sync_logic.test.ts', testCount: 4 },
];

console.log('================================================================');
console.log('         WARERA EGYPT DISCORD BOT — FULL QA TEST RUNNER         ');
console.log('================================================================\n');

let totalPassedSuites = 0;
let totalFailedSuites = 0;
let totalTestsCount = 0;
const results: { name: string; file: string; passed: boolean; durationMs: number }[] = [];

const startTime = Date.now();

for (const suite of suites) {
  const filePath = path.join(__dirname, suite.file);
  console.log(`>>> Running Suite: ${suite.name} (${suite.file})...`);
  const suiteStart = Date.now();

  const child = spawnSync('npx', ['ts-node', filePath], {
    shell: true,
    stdio: 'inherit',
  });

  const durationMs = Date.now() - suiteStart;
  const passed = child.status === 0;

  if (passed) {
    totalPassedSuites++;
    totalTestsCount += suite.testCount;
    results.push({ name: suite.name, file: suite.file, passed: true, durationMs });
    console.log(`✔ Suite [${suite.name}] PASSED (${durationMs}ms)\n`);
  } else {
    totalFailedSuites++;
    results.push({ name: suite.name, file: suite.file, passed: false, durationMs });
    console.error(`✖ Suite [${suite.name}] FAILED with exit code ${child.status} (${durationMs}ms)\n`);
  }
}

const totalDurationMs = Date.now() - startTime;

console.log('================================================================');
console.log('                        SUMMARY RESULTS                         ');
console.log('================================================================');
console.log(`Total Suites Run : ${suites.length}`);
console.log(`Suites Passed    : ${totalPassedSuites}`);
console.log(`Suites Failed    : ${totalFailedSuites}`);
console.log(`Total Test Cases : ${totalTestsCount} verified passed`);
console.log(`Total Duration   : ${(totalDurationMs / 1000).toFixed(2)}s`);
console.log('----------------------------------------------------------------');

for (const res of results) {
  const statusStr = res.passed ? 'PASS' : 'FAIL';
  console.log(` [${statusStr}] ${res.name.padEnd(45)} (${res.durationMs}ms)`);
}

console.log('================================================================\n');

if (totalFailedSuites > 0) {
  console.error('CRITICAL: One or more test suites failed!');
  process.exit(1);
} else {
  console.log('SUCCESS: All QA test suites executed with 100% pass rate.');
  process.exit(0);
}
