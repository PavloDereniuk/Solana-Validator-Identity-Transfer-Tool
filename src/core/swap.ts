import { setIdentity, waitForRestartWindow, getPubkey } from './validator.js';
import { transferTower } from './tower.js';
import type { Target } from './ssh.js';
import type { Auditor } from './audit.js';

export type SwapEnd = {
  target: Target;
  ledger: string;
};

export type SwapPlan = {
  from: SwapEnd;
  to: SwapEnd;
  stakedKeyfile: string;
  unstakedKeyfile: string;
};

export type SwapHooks = {
  onStep?: (n: number, total: number, label: string) => void;
  audit?: Auditor;
};

function hostOf(t: Target): string {
  return `${t.host}:${t.port}`;
}

export async function executeSwap(plan: SwapPlan, hooks: SwapHooks = {}): Promise<{ stakedPubkey: string; bytes: number }> {
  const { from, to, stakedKeyfile, unstakedKeyfile } = plan;

  await hooks.audit?.write({ step: 'swap-start', host: hostOf(from.target), message: `from=${hostOf(from.target)} to=${hostOf(to.target)}` });

  const stakedPubkey = await getPubkey(from.target, stakedKeyfile);
  await hooks.audit?.write({ step: 'resolve-pubkey', host: hostOf(from.target), message: stakedPubkey });

  // TODO: bail out if wait-for-restart-window blocks for longer than something sane
  hooks.onStep?.(1, 4, 'wait for restart window on source');
  const tWait = Date.now();
  await waitForRestartWindow(from, { minIdleTime: 2, skipSnapshotCheck: true });
  await hooks.audit?.write({ step: 'wait-for-restart-window', host: hostOf(from.target), durationMs: Date.now() - tWait, exit: 0 });

  hooks.onStep?.(2, 4, 'set source to unstaked identity');
  const tSet = Date.now();
  await setIdentity(from, unstakedKeyfile);
  await hooks.audit?.write({ step: 'set-identity-unstaked', host: hostOf(from.target), durationMs: Date.now() - tSet, exit: 0 });

  hooks.onStep?.(3, 4, 'transfer tower file');
  const bytes = await transferTower(from.target, to.target, from.ledger, to.ledger, stakedPubkey);
  await hooks.audit?.write({ step: 'transfer-tower', host: hostOf(to.target), message: `${bytes} bytes` });

  hooks.onStep?.(4, 4, 'activate staked identity on target');
  await setIdentity(to, stakedKeyfile, { requireTower: true });
  await hooks.audit?.write({ step: 'set-identity-staked', host: hostOf(to.target), exit: 0 });

  await hooks.audit?.write({ step: 'swap-complete', host: hostOf(to.target), message: `staked=${stakedPubkey}` });

  return { stakedPubkey, bytes };
}
