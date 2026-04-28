import { useEffect, useState } from 'react';
import { exec, type Target } from '../core/ssh.js';

export type ValidatorState = {
  identity?: string;
  slot?: number;
  loading: boolean;
  error?: string;
  lastUpdated?: number;
};

const POLL_MS = 5_000;

export function useValidatorState(target: Target, ledger: string, paused = false): ValidatorState {
  const [state, setState] = useState<ValidatorState>({ loading: true });

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    let timer: NodeJS.Timeout | undefined;

    const tick = async () => {
      try {
        const r = await exec(target, `agave-validator -l ${ledger} monitor`);
        if (cancelled) return;
        const out = (r.stdout || '') + (r.stderr || '');
        const slotMatch = out.match(/slot\s+(\d+)/i);
        const idMatch = out.match(/identity\s+(\S+)/i);
        setState({
          loading: false,
          slot: slotMatch ? Number(slotMatch[1]) : undefined,
          identity: idMatch && idMatch[1] !== 'none' ? idMatch[1] : undefined,
          lastUpdated: Date.now(),
        });
      } catch (e) {
        if (cancelled) return;
        setState({ loading: false, error: e instanceof Error ? e.message : String(e), lastUpdated: Date.now() });
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [target.host, target.port, target.user, target.keyPath, ledger, paused]);

  return state;
}
