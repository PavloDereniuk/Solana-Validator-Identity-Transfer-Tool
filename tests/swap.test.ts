import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSwap, type SwapPlan } from '../src/core/swap.js';

const plan: SwapPlan = {
  from: {
    target: { host: '10.0.0.1', port: 22, user: 'sol', keyPath: '/k' },
    ledger: '/var/ledger-a',
  },
  to: {
    target: { host: '10.0.0.2', port: 22, user: 'sol', keyPath: '/k' },
    ledger: '/var/ledger-b',
  },
  stakedKeyfile: '/etc/keys/staked.json',
  unstakedKeyfile: '/etc/keys/unstaked.json',
};

test('plan has the four canonical steps in order', () => {
  const steps = planSwap(plan, { stakedPubkey: 'PUBKEY' });
  assert.deepEqual(
    steps.map((s) => s.id),
    ['wait-restart', 'set-unstaked', 'transfer-tower', 'set-staked'],
  );
});

test('source-side commands target the source host', () => {
  const steps = planSwap(plan, { stakedPubkey: 'PUBKEY' });
  for (const id of ['wait-restart', 'set-unstaked'] as const) {
    const s = steps.find((x) => x.id === id)!;
    for (const ln of s.lines) assert.match(ln.host, /10\.0\.0\.1/);
  }
});

test('set-staked runs on the destination host with --require-tower', () => {
  const steps = planSwap(plan, { stakedPubkey: 'PUBKEY' });
  const last = steps.find((s) => s.id === 'set-staked')!;
  assert.equal(last.lines.length, 1);
  assert.match(last.lines[0].host, /10\.0\.0\.2/);
  assert.match(last.lines[0].command, /--require-tower/);
  assert.match(last.lines[0].command, /staked\.json$/);
});

test('set-unstaked uses the unstaked keyfile and never --require-tower', () => {
  const steps = planSwap(plan, { stakedPubkey: 'PUBKEY' });
  const s = steps.find((x) => x.id === 'set-unstaked')!;
  assert.match(s.lines[0].command, /unstaked\.json$/);
  assert.doesNotMatch(s.lines[0].command, /--require-tower/);
});

test('tower transfer is a two-line step: read on source, write on dest', () => {
  const steps = planSwap(plan, { stakedPubkey: 'PUB123' });
  const t = steps.find((s) => s.id === 'transfer-tower')!;
  assert.equal(t.lines.length, 2);
  assert.match(t.lines[0].host, /10\.0\.0\.1/);
  assert.match(t.lines[0].command, /base64 -w0 < \/var\/ledger-a\/tower-1_9-PUB123\.bin/);
  assert.match(t.lines[1].host, /10\.0\.0\.2/);
  assert.match(t.lines[1].command, /base64 -d > \/var\/ledger-b\/tower-1_9-PUB123\.bin/);
  assert.equal(t.lines[1].stdinFrom, 'tower-base64');
});

test('the staked pubkey ends up in the tower paths verbatim', () => {
  const steps = planSwap(plan, { stakedPubkey: 'ZZZ' });
  const t = steps.find((s) => s.id === 'transfer-tower')!;
  assert.match(t.lines[0].command, /tower-1_9-ZZZ\.bin/);
  assert.match(t.lines[1].command, /tower-1_9-ZZZ\.bin/);
});

test('every step has a non-empty human label', () => {
  const steps = planSwap(plan, { stakedPubkey: 'PUBKEY' });
  for (const s of steps) {
    assert.ok(s.label.length > 0, `step ${s.id} has no label`);
  }
});
