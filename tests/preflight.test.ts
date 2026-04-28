import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks, type Check } from '../src/core/preflight.js';

const ok = (name: string, weight = 1): Check => ({
  name,
  weight,
  run: async () => ({ level: 'pass', message: 'ok' }),
});

const warn = (name: string, weight = 1): Check => ({
  name,
  weight,
  run: async () => ({ level: 'warn', message: 'meh' }),
});

const fail = (name: string, weight = 1): Check => ({
  name,
  weight,
  run: async () => ({ level: 'fail', message: 'nope' }),
});

const boom = (name: string, weight = 1): Check => ({
  name,
  weight,
  run: async () => { throw new Error('boom'); },
});

test('all-pass scores 100 and recommends go', async () => {
  const r = await runChecks([ok('a'), ok('b'), ok('c')]);
  assert.equal(r.score, 100);
  assert.equal(r.recommendation, 'go');
});

test('a single fail collapses to no-go regardless of score', async () => {
  const r = await runChecks([ok('a', 9), ok('b', 9), fail('c', 1)]);
  assert.equal(r.recommendation, 'no-go');
  // passing weight dominates the score, but a fail is still a fail.
  assert.ok(r.score >= 90);
});

test('warn without any fail yields wait', async () => {
  const r = await runChecks([ok('a'), warn('b')]);
  assert.equal(r.recommendation, 'wait');
});

test('warn contributes half of its weight to the score', async () => {
  // weight-8 ok + weight-2 warn → (8 + 1) / 10 = 90
  const r = await runChecks([ok('a', 8), warn('b', 2)]);
  assert.equal(r.score, 90);
});

test('weight matters in the score calculation', async () => {
  // weight-9 fail + weight-1 ok → 1/10 = 10
  const r = await runChecks([fail('a', 9), ok('b', 1)]);
  assert.equal(r.score, 10);
  assert.equal(r.recommendation, 'no-go');
});

test('thrown error in a check is recorded as fail with the message', async () => {
  const r = await runChecks([ok('a'), boom('b')]);
  assert.equal(r.recommendation, 'no-go');
  const last = r.results[1];
  assert.equal(last.level, 'fail');
  assert.match(last.detail ?? '', /boom/);
});

test('empty check list scores 0 (no information, no warning)', async () => {
  const r = await runChecks([]);
  assert.equal(r.score, 0);
  // no fails, no warns → vacuously go. callers should still treat this with care.
  assert.equal(r.recommendation, 'go');
});

test('score rounds to nearest integer', async () => {
  // 1 ok + 2 warn at weight 1 each → (1 + 0.5 + 0.5) / 3 = 0.6666… → 67
  const r = await runChecks([ok('a'), warn('b'), warn('c')]);
  assert.equal(r.score, 67);
});

test('several warns still resolve to wait, not no-go', async () => {
  const r = await runChecks([warn('a'), warn('b'), warn('c')]);
  assert.equal(r.recommendation, 'wait');
  assert.equal(r.score, 50);
});

test('result objects keep the original name and weight', async () => {
  const r = await runChecks([ok('preflight-x', 5)]);
  assert.equal(r.results[0].name, 'preflight-x');
  assert.equal(r.results[0].weight, 5);
});

test('a heavy fail dominates several light passes', async () => {
  const r = await runChecks([
    ok('a', 1),
    ok('b', 1),
    ok('c', 1),
    ok('d', 1),
    fail('e', 6),
  ]);
  assert.equal(r.score, 40);
  assert.equal(r.recommendation, 'no-go');
});
