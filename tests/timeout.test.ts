import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, TimeoutError } from '../src/util/timeout.js';

test('withTimeout resolves with the value when the promise wins', async () => {
  const v = await withTimeout(Promise.resolve(42), 1000, 'fast');
  assert.equal(v, 42);
});

test('withTimeout rejects with TimeoutError when the deadline hits first', async () => {
  const slow = new Promise((r) => setTimeout(r, 200));
  await assert.rejects(
    () => withTimeout(slow, 20, 'slow-op'),
    (e: unknown) => e instanceof TimeoutError && e.label === 'slow-op',
  );
});

test('withTimeout propagates the underlying rejection', async () => {
  await assert.rejects(
    () => withTimeout(Promise.reject(new Error('nope')), 1000, 'x'),
    /nope/,
  );
});

test('non-positive ms disables the timeout (acts as identity)', async () => {
  const v = await withTimeout(Promise.resolve('ok'), 0, 'no-timeout');
  assert.equal(v, 'ok');
});
