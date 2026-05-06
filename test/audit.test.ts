import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { parseFile } from '../src/utils/parser.js';
import { scanSecrets, checkReadmeDrift } from '../src/utils/scanner.js';

const fixturesRoot = path.resolve('test/fixtures');

test('clean fixture produces no leak findings', async () => {
  const env = await parseFile(path.join(fixturesRoot, 'clean/.env'));
  const issues = scanSecrets(env, '.env');
  assert.strictEqual(issues.length, 0);
});

test('leaky fixture flags Stripe + entropy and emits ruleIds', async () => {
  const env = await parseFile(path.join(fixturesRoot, 'leaky/.env'));
  const issues = scanSecrets(env, '.env');
  const ids = issues.map(i => i.ruleId).sort();
  assert.ok(ids.includes('leak.stripe'));
  assert.ok(ids.includes('leak.entropy'));
  for (const i of issues) assert.ok(i.ruleId, 'every issue must carry a ruleId');
});

test('README drift detects undocumented var', async () => {
  const env = await parseFile(path.join(fixturesRoot, 'leaky/.env'));
  const issues = await checkReadmeDrift(env, path.join(fixturesRoot, 'leaky/README.md'));
  assert.ok(issues.some(i => i.ruleId === 'doc-drift.undocumented' && i.key === 'STRIPE_SECRET'));
});
