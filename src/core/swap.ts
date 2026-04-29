import {
  setIdentity,
  waitForRestartWindow,
  getPubkey,
  cmdSetIdentity,
  cmdWaitForRestartWindow,
} from './validator.js';
import { transferTower, cmdReadTower, cmdWriteTower } from './tower.js';
import type { Target } from './ssh.js';
import type { Auditor } from './audit.js';
import { withTimeout } from '../util/timeout.js';

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
  waitTimeoutMs?: number;
};

export type StepLine = {
  host: string;
  command: string;
  // stdin hint for dry-run printers; the exec path passes real bytes
  stdinFrom?: string;
};

export type SwapStep = {
  id: 'wait-restart' | 'set-unstaked' | 'transfer-tower' | 'set-staked';
  label: string;
  lines: StepLine[];
};

function hostOf(t: Target): string {
  return `${t.user}@${t.host}:${t.port}`;
}

// pure: builds the same command sequence the executor will run.
// keep this in sync with executeSwap below.
export function planSwap(plan: SwapPlan, ctx: { stakedPubkey: string }): SwapStep[] {
  const { from, to, stakedKeyfile, unstakedKeyfile } = plan;
  const pub = ctx.stakedPubkey;

  return [
    {
      id: 'wait-restart',
      label: 'wait for restart window on source',
      lines: [{
        host: hostOf(from.target),
        command: cmdWaitForRestartWindow(from, { minIdleTime: 2, skipSnapshotCheck: true }),
      }],
    },
    {
      id: 'set-unstaked',
      label: 'set source to unstaked identity',
      lines: [{
        host: hostOf(from.target),
        command: cmdSetIdentity(from, unstakedKeyfile),
      }],
    },
    {
      id: 'transfer-tower',
      label: 'transfer tower file',
      lines: [
        { host: hostOf(from.target), command: cmdReadTower(from.ledger, pub) },
        { host: hostOf(to.target),   command: cmdWriteTower(to.ledger, pub), stdinFrom: 'tower-base64' },
      ],
    },
    {
      id: 'set-staked',
      label: 'activate staked identity on target',
      lines: [{
        host: hostOf(to.target),
        command: cmdSetIdentity(to, stakedKeyfile, { requireTower: true }),
      }],
    },
  ];
}

export async function resolveStakedPubkey(plan: SwapPlan): Promise<string> {
  return getPubkey(plan.from.target, plan.stakedKeyfile);
}

export async function executeSwap(plan: SwapPlan, hooks: SwapHooks = {}): Promise<{ stakedPubkey: string; bytes: number }> {
  const { from, to, stakedKeyfile, unstakedKeyfile } = plan;

  await hooks.audit?.write({ step: 'swap-start', host: hostOf(from.target), message: `from=${hostOf(from.target)} to=${hostOf(to.target)}` });

  const stakedPubkey = await resolveStakedPubkey(plan);
  await hooks.audit?.write({ step: 'resolve-pubkey', host: hostOf(from.target), message: stakedPubkey });

  const steps = planSwap(plan, { stakedPubkey });
  const total = steps.length;

  hooks.onStep?.(1, total, steps[0].label);
  const tWait = Date.now();
  const waitTimeout = hooks.waitTimeoutMs ?? 600_000;
  await withTimeout(
    waitForRestartWindow(from, { minIdleTime: 2, skipSnapshotCheck: true }),
    waitTimeout,
    'wait-for-restart-window',
  );
  await hooks.audit?.write({ step: 'wait-for-restart-window', host: hostOf(from.target), durationMs: Date.now() - tWait, exit: 0 });

  hooks.onStep?.(2, total, steps[1].label);
  const tSet = Date.now();
  await setIdentity(from, unstakedKeyfile);
  await hooks.audit?.write({ step: 'set-identity-unstaked', host: hostOf(from.target), durationMs: Date.now() - tSet, exit: 0 });

  hooks.onStep?.(3, total, steps[2].label);
  const bytes = await transferTower(from.target, to.target, from.ledger, to.ledger, stakedPubkey);
  await hooks.audit?.write({ step: 'transfer-tower', host: hostOf(to.target), message: `${bytes} bytes` });

  hooks.onStep?.(4, total, steps[3].label);
  await setIdentity(to, stakedKeyfile, { requireTower: true });
  await hooks.audit?.write({ step: 'set-identity-staked', host: hostOf(to.target), exit: 0 });

  await hooks.audit?.write({ step: 'swap-complete', host: hostOf(to.target), message: `staked=${stakedPubkey}` });

  return { stakedPubkey, bytes };
}
