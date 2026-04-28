import { EventEmitter } from 'node:events';
import { useEffect, useReducer } from 'react';

export type StepStatus = 'pending' | 'running' | 'done' | 'fail';

export type StepState = {
  id: string;
  label: string;
  status: StepStatus;
  durationMs?: number;
};

export type FinalState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; message: string }
  | { kind: 'fail'; message: string }
  | { kind: 'rolled-back'; message: string };

export class TuiStore {
  private emitter = new EventEmitter();

  steps: StepState[] = [];
  outcome: FinalState = { kind: 'idle' };
  // hint shown above panels — e.g. preflight summary / waiting message
  banner: string | null = null;

  setSteps(steps: StepState[]) { this.steps = steps; this.emit(); }

  updateStep(id: string, patch: Partial<StepState>) {
    this.steps = this.steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
    this.emit();
  }

  setOutcome(o: FinalState) { this.outcome = o; this.emit(); }
  setBanner(b: string | null) { this.banner = b; this.emit(); }

  subscribe(cb: () => void): () => void {
    this.emitter.on('change', cb);
    return () => { this.emitter.off('change', cb); };
  }

  private emit(): void { this.emitter.emit('change'); }
}

export function useTuiStore(store: TuiStore): TuiStore {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => store.subscribe(() => force()), [store]);
  return store;
}
