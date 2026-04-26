import { exec, type Target } from './ssh.js';

export type ValidatorEnv = {
  target: Target;
  ledger: string;
};

export type WaitOpts = {
  minIdleTime?: number;
  skipSnapshotCheck?: boolean;
};

export async function waitForRestartWindow(env: ValidatorEnv, opts: WaitOpts = {}): Promise<void> {
  const flags: string[] = [];
  if (opts.minIdleTime !== undefined) flags.push(`--min-idle-time ${opts.minIdleTime}`);
  if (opts.skipSnapshotCheck) flags.push('--skip-new-snapshot-check');
  const cmd = `agave-validator -l ${env.ledger} wait-for-restart-window ${flags.join(' ')}`.trim();
  const r = await exec(env.target, cmd);
  if (r.code !== 0) {
    throw new Error(`wait-for-restart-window failed (${r.code}): ${r.stderr || r.stdout}`);
  }
}

export type SetIdentityOpts = {
  requireTower?: boolean;
};

export async function setIdentity(
  env: ValidatorEnv,
  keyfileOnRemote: string,
  opts: SetIdentityOpts = {}
): Promise<void> {
  const tower = opts.requireTower ? '--require-tower' : '';
  const cmd = `agave-validator -l ${env.ledger} set-identity ${tower} ${keyfileOnRemote}`.trim();
  const r = await exec(env.target, cmd);
  if (r.code !== 0) {
    throw new Error(`set-identity failed (${r.code}): ${r.stderr || r.stdout}`);
  }
}

export async function getPubkey(target: Target, keyfileOnRemote: string): Promise<string> {
  const r = await exec(target, `solana address -k ${keyfileOnRemote}`);
  if (r.code !== 0) {
    throw new Error(`solana address failed: ${r.stderr || r.stdout}`);
  }
  return r.stdout.trim();
}

export async function catchupStatus(target: Target): Promise<string> {
  const r = await exec(target, 'solana catchup --our-localhost');
  if (r.code !== 0) {
    throw new Error(`catchup failed: ${r.stderr || r.stdout}`);
  }
  return r.stdout.trim();
}
