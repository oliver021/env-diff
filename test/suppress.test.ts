import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  applySuppressions, fingerprint, loadIgnore, loadBaseline, writeBaseline, meetsThreshold
} from '../src/utils/suppress.js';
import { AuditIssue } from '../src/types.js';

const sample: AuditIssue[] = [
  { type: 'leak', ruleId: 'leak.stripe', severity: 'high', message: 'a', file: '.env', key: 'STRIPE_SECRET' },
  { type: 'leak', ruleId: 'leak.entropy', severity: 'medium', message: 'b', file: '.env', key: 'JWT_SECRET' },
  { type: 'doc-drift', ruleId: 'doc-drift.undocumented', severity: 'low', message: 'c', file: 'README.md', key: 'PORT' }
];

test('meetsThreshold respects severity ranking', () => {
  assert.strictEqual(meetsThreshold('low', 'medium'), false);
  assert.strictEqual(meetsThreshold('high', 'medium'), true);
  assert.strictEqual(meetsThreshold('critical', 'high'), true);
});

test('applySuppressions filters by ruleId', () => {
  const out = applySuppressions(sample, [{ ruleId: 'leak.entropy' }], new Set());
  assert.strictEqual(out.length, 2);
  assert.ok(!out.some(i => i.ruleId === 'leak.entropy'));
});

test('applySuppressions scoped by key + file', () => {
  const out = applySuppressions(sample, [{ ruleId: 'leak.stripe', key: 'STRIPE_SECRET', file: '.env' }], new Set());
  assert.strictEqual(out.length, 2);
});

test('applySuppressions filters by baseline fingerprint', () => {
  const baseline = new Set([fingerprint(sample[0])]);
  const out = applySuppressions(sample, [], baseline);
  assert.strictEqual(out.length, 2);
  assert.ok(!out.some(i => i.ruleId === 'leak.stripe'));
});

test('loadIgnore parses comments and triple syntax', async () => {
  const tmp = path.join(os.tmpdir(), `envdiff-${Date.now()}.ignore`);
  await fs.writeFile(tmp, [
    '# header comment',
    'leak.entropy',
    'leak.stripe:STRIPE_SECRET',
    'doc-drift.undocumented:PORT@README.md  # inline comment',
    ''
  ].join('\n'));
  const rules = await loadIgnore(tmp);
  assert.strictEqual(rules.length, 3);
  assert.deepStrictEqual(rules[2], { ruleId: 'doc-drift.undocumented', key: 'PORT', file: 'README.md' });
  await fs.unlink(tmp);
});

test('writeBaseline + loadBaseline round-trip', async () => {
  const tmp = path.join(os.tmpdir(), `envdiff-${Date.now()}.baseline.json`);
  await writeBaseline(tmp, sample);
  const set = await loadBaseline(tmp);
  assert.ok(set.has(fingerprint(sample[0])));
  assert.strictEqual(set.size, 3);
  await fs.unlink(tmp);
});
