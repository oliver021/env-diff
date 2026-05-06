import test from 'node:test';
import assert from 'node:assert';
import { calculateEntropy, scanSecrets } from '../src/utils/scanner.js';

test('Shannon Entropy Calculations', async (t) => {
  await t.test('returns 0 for empty string', () => {
    assert.strictEqual(calculateEntropy(''), 0);
  });

  await t.test('low entropy for repeating characters', () => {
    const ent = calculateEntropy('aaaaaaaaaaaaaaaaaaaa');
    assert.strictEqual(ent, 0); // No surprise, always 'a'
  });

  await t.test('high entropy for randomized character strings', () => {
    const lowEnt = calculateEntropy('hello12345');
    const highEnt = calculateEntropy('4f7g8h9j2k1l0p9o8i7u6y5t4r3e2w1q');
    assert.ok(highEnt > lowEnt, `Expected randomized string (${highEnt}) to have higher entropy than simple string (${lowEnt})`);
  });
});

test('Secret Pattern Scanners', async (t) => {
  await t.test('detects Stripe live keys', () => {
    const env = {
      STRIPE_SECRET: ['sk', 'live', 'TESTTESTTESTTESTTESTTEST'].join('_')
    };
    const issues = scanSecrets(env, '.env');
    assert.ok(issues.length >= 1);
    assert.match(issues[0].message, /Leaked Stripe Secret Key/);
  });

  await t.test('detects AWS Access Key ID', () => {
    const env = {
      AWS_ACCESS_KEY: 'AKIAIOSFODNN7EXAMPLE'
    };
    const issues = scanSecrets(env, '.env');
    assert.strictEqual(issues.length, 1);
    assert.match(issues[0].message, /AWS Access Key ID/);
  });

  await t.test('detects generic high entropy secrets', () => {
    const env = {
      APP_JWT_SECRET: '4f7g8h9j2k1l0p9o8i7u6y5t4r3e2w1q5k9m7n8'
    };
    const issues = scanSecrets(env, '.env');
    assert.strictEqual(issues.length, 1);
    assert.match(issues[0].message, /Suspected high-entropy secret/);
  });

  await t.test('ignores generic secret placeholders', () => {
    const env = {
      APP_JWT_SECRET: 'your_jwt_secret_here'
    };
    const issues = scanSecrets(env, '.env');
    assert.strictEqual(issues.length, 0);
  });
});
