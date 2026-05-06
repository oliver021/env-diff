import test from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const cli = path.resolve('dist/src/index.js');
const fx = path.resolve('test/fixtures/three-way');

function run(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], { encoding: 'utf-8' });
    return { stdout, status: 0 };
  } catch (e: any) {
    return { stdout: (e.stdout || '') + (e.stderr || ''), status: e.status ?? 1 };
  }
}

test('compare 3 files emits matrix JSON with all keys', () => {
  const { stdout, status } = run([
    'compare', `${fx}/.env.local`, `${fx}/.env.staging`, `${fx}/.env.production`,
    '--output', 'json'
  ]);
  assert.strictEqual(status, 0);
  const out = JSON.parse(stdout);
  assert.strictEqual(out.kind, 'matrix');
  assert.strictEqual(out.result.files.length, 3);
  assert.ok(out.result.keys.includes('SENTRY_DSN'));
  assert.ok(out.result.keys.includes('DEBUG'));
});

test('compare --fail-on-diff exits 1 on drift', () => {
  const { status } = run([
    'compare', `${fx}/.env.local`, `${fx}/.env.production`,
    '--fail-on-diff', '--output', 'json'
  ]);
  assert.strictEqual(status, 1);
});

test('compare missing file exits 2 (tool error)', () => {
  const { status } = run([
    'compare', `${fx}/.env.local`, `${fx}/.env.does-not-exist`,
    '--output', 'json'
  ]);
  assert.strictEqual(status, 2);
});
