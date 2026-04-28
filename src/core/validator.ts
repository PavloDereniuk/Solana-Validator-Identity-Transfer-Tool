import { exec, type Target } from './ssh.js';

export type ValidatorEnv = {
  target: Target;
  ledger: string;
};

export type WaitOpts = {
  minIdleTime?: number;
  skipSnapshotCheck?: boolean;
};

export function cmdWaitForRestartWindow(env: ValidatorEnv, opts: WaitOpts = {}): string {
  const flags: string[] = [];
  if (opts.minIdleTime !== undefined) flags.push(`--min-idle-time ${opts.minIdleTime}`);
  if (opts.skipSnapshotCheck) flags.push('--skip-new-snapshot-check');
  return `agave-validator -l ${env.ledger} wait-for-restart-window ${flags.join(' ')}`.trim();
}

export async function waitForRestartWindow(env: ValidatorEnv, opts: WaitOpts = {}): Promise<void> {
  const cmd = cmdWaitForRestartWindow(env, opts);
  const r = await exec(env.target, cmd);
  if (r.code !== 0) {
    throw new Error(`wait-for-restart-window failed (${r.code}): ${r.stderr || r.stdout}`);
  }
}

export type SetIdentityOpts = {
  requireTower?: boolean;
};

export function cmdSetIdentity(env: ValidatorEnv, keyfileOnRemote: string, opts: SetIdentityOpts = {}): string {
  const parts = ['agave-validator', '-l', env.ledger, 'set-identity'];
  if (opts.requireTower) parts.push('--require-tower');
  parts.push(keyfileOnRemote);
  return parts.join(' ');
}

export async function setIdentity(
  env: ValidatorEnv,
  keyfileOnRemote: string,
  opts: SetIdentityOpts = {}
): Promise<void> {
  const cmd = cmdSetIdentity(env, keyfileOnRemote, opts);
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
