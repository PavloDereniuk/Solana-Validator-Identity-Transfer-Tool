import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCatchup } from '../src/core/rollback.js';

test('"up to date" returns 0 regardless of surrounding text', () => {
  assert.equal(parseCatchup('Node is up to date'), 0);
  assert.equal(parseCatchup('  Node is UP TO DATE  '), 0);
});

test('plain "N slots behind" form', () => {
  assert.equal(parseCatchup('234 slots behind'), 234);
  assert.equal(parseCatchup('1 slot behind'), 1);
});

test('multi-line output picks up the slots line', () => {
  const out = [
    'Connecting to RPC...',
    'Validator is 412 slots behind us',
    '',
  ].join('\n');
  assert.equal(parseCatchup(out), 412);
});

test('negative slots (validator ahead) parsed as a negative number', () => {
  // unusual but it does happen during fork divergence — preserve the sign so
  // the caller can decide whether |slots| is small enough.
  assert.equal(parseCatchup('Validator is -3 slots ahead of us'), -3);
});

test('singular "slot" matches as well as plural', () => {
  assert.equal(parseCatchup('1 slot behind'), 1);
});

test('garbage / unrelated output returns null', () => {
  assert.equal(parseCatchup('connection refused'), null);
  assert.equal(parseCatchup(''), null);
});

test('"up to date" wins over a stray slot count in the same blob', () => {
  // sometimes the previous line printed "234 slots behind" then converged.
  // up-to-date should be the truth of the moment.
  const out = '234 slots behind\nNode is up to date';
  assert.equal(parseCatchup(out), 0);
});

test('large slot counts parse correctly', () => {
  assert.equal(parseCatchup('98765 slots behind'), 98765);
});
