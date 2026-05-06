import test from 'node:test';
import assert from 'node:assert';
import { toJson, toSarif } from '../src/utils/reporters.js';
import { AuditIssue } from '../src/types.js';

const issues: AuditIssue[] = [
  {
    type: 'leak', ruleId: 'leak.stripe', severity: 'high',
    message: 'Leaked Stripe key', file: '.env', key: 'STRIPE_SECRET'
  },
  {
    type: 'doc-drift', ruleId: 'doc-drift.undocumented', severity: 'low',
    message: 'Undocumented var', file: 'README.md', key: 'PORT'
  }
];

test('toJson produces parseable output with kind=audit', () => {
  const out = JSON.parse(toJson(issues));
  assert.strictEqual(out.kind, 'audit');
  assert.strictEqual(out.issues.length, 2);
  assert.strictEqual(out.issues[0].ruleId, 'leak.stripe');
});

test('toSarif produces a valid SARIF 2.1.0 envelope', () => {
  const sarif = JSON.parse(toSarif(issues));
  assert.strictEqual(sarif.version, '2.1.0');
  assert.ok(Array.isArray(sarif.runs));
  assert.strictEqual(sarif.runs[0].tool.driver.name, 'env-drift');
  assert.strictEqual(sarif.runs[0].results.length, 2);
  assert.strictEqual(sarif.runs[0].results[0].level, 'error');
  assert.strictEqual(sarif.runs[0].results[1].level, 'note');
  assert.strictEqual(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, '.env');
});

test('toSarif maps critical to error', () => {
  const crit: AuditIssue[] = [{ type: 'leak', ruleId: 'leak.stripe', severity: 'critical', message: 'live!' }];
  const sarif = JSON.parse(toSarif(crit));
  assert.strictEqual(sarif.runs[0].results[0].level, 'error');
});
