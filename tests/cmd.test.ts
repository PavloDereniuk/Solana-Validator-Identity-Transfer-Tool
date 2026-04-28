import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cmdSetIdentity,
  cmdWaitForRestartWindow,
  type ValidatorEnv,
} from '../src/core/validator.js';
import { cmdReadTower, cmdWriteTower, towerFilename } from '../src/core/tower.js';

const env: ValidatorEnv = {
  ledger: '/var/ledger',
  target: { host: '10.0.0.1', port: 22, user: 'sol', keyPath: '/tmp/k' },
};

test('cmdSetIdentity without options just points at the keyfile', () => {
  const cmd = cmdSetIdentity(env, '/etc/keys/unstaked.json');
  assert.equal(
    cmd,
    'agave-validator -l /var/ledger set-identity /etc/keys/unstaked.json',
  );
});

test('cmdSetIdentity with requireTower inserts --require-tower before keyfile', () => {
  const cmd = cmdSetIdentity(env, '/etc/keys/staked.json', { requireTower: true });
  assert.equal(
    cmd,
    'agave-validator -l /var/ledger set-identity --require-tower /etc/keys/staked.json',
  );
});

test('cmdWaitForRestartWindow with no opts has no flags', () => {
  assert.equal(
    cmdWaitForRestartWindow(env),
    'agave-validator -l /var/ledger wait-for-restart-window',
  );
});

test('cmdWaitForRestartWindow honors minIdleTime', () => {
  assert.equal(
    cmdWaitForRestartWindow(env, { minIdleTime: 5 }),
    'agave-validator -l /var/ledger wait-for-restart-window --min-idle-time 5',
  );
});

test('cmdWaitForRestartWindow with skipSnapshotCheck appends the long flag', () => {
  assert.equal(
    cmdWaitForRestartWindow(env, { skipSnapshotCheck: true }),
    'agave-validator -l /var/ledger wait-for-restart-window --skip-new-snapshot-check',
  );
});

test('cmdWaitForRestartWindow combines both flags in order', () => {
  assert.equal(
    cmdWaitForRestartWindow(env, { minIdleTime: 2, skipSnapshotCheck: true }),
    'agave-validator -l /var/ledger wait-for-restart-window --min-idle-time 2 --skip-new-snapshot-check',
  );
});

test('towerFilename is the agave-1.9 naming convention', () => {
  assert.equal(towerFilename('PUBKEY1'), 'tower-1_9-PUBKEY1.bin');
});

test('cmdReadTower base64-encodes from the right path', () => {
  assert.equal(
    cmdReadTower('/var/ledger', 'PUBKEY1'),
    'base64 -w0 < /var/ledger/tower-1_9-PUBKEY1.bin',
  );
});

test('cmdWriteTower decodes into the right path', () => {
  assert.equal(
    cmdWriteTower('/srv/ledger', 'PUBKEY1'),
    'base64 -d > /srv/ledger/tower-1_9-PUBKEY1.bin',
  );
});

test('different ledgers and pubkeys round-trip cleanly', () => {
  const r = cmdReadTower('/a', 'X');
  const w = cmdWriteTower('/b', 'X');
  assert.match(r, /\/a\/tower-1_9-X\.bin/);
  assert.match(w, /\/b\/tower-1_9-X\.bin/);
});
