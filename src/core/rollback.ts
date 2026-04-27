// agave/solana phrases catchup a few ways across releases — "N slots behind",
// "N slot(s) behind", "Node is up to date". keep the regex forgiving.

import { exec, type Target } from './ssh.js';

export type WatchOpts = {
  timeoutMs: number;
  intervalMs: number;
  slotThreshold: number;
};

export type WatchResult = {
  converged: boolean;
  lastSlotsBehind: number | null;
  samples: number;
  reason?: string;
};

export const DEFAULT_WATCH: WatchOpts = {
  timeoutMs: 90_000,
  intervalMs: 5_000,
  slotThreshold: 50,
};

const SLOTS_RE = /(-?\d+)\s+slot/i;
const UP_TO_DATE_RE = /up to date/i;

export function parseCatchup(out: string): number | null {
  // FIXME: this is going to break next time agave reshuffles the wording
  if (UP_TO_DATE_RE.test(out)) return 0;
  const m = out.match(SLOTS_RE);
  return m ? Number(m[1]) : null;
}

export async function watchCatchup(target: Target, opts: WatchOpts = DEFAULT_WATCH): Promise<WatchResult> {
  const deadline = Date.now() + opts.timeoutMs;
  let last: number | null = null;
  let samples = 0;

  while (Date.now() < deadline) {
    const r = await exec(target, 'solana catchup --our-localhost');
    samples += 1;
    if (r.code !== 0) {
      // validator probably still booting after set-identity. keep polling.
      await sleep(opts.intervalMs);
      continue;
    }
    const slots = parseCatchup(r.stdout + r.stderr);
    if (slots !== null) {
      last = slots;
      if (Math.abs(slots) <= opts.slotThreshold) {
        return { converged: true, lastSlotsBehind: slots, samples };
      }
    }
    await sleep(opts.intervalMs);
  }

  return {
    converged: false,
    lastSlotsBehind: last,
    samples,
    reason: last === null ? 'no parseable catchup output' : `still ${last} slots behind after ${opts.timeoutMs}ms`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
