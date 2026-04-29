// race a promise against a deadline. on timeout, rejects with a labeled
// error. the underlying promise keeps running — for the cases we use this
// for (ssh exec) the leaked connection gets cleaned up by the server's
// idle timeout. acceptable for a one-shot CLI.

export class TimeoutError extends Error {
  constructor(public readonly label: string, public readonly ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}
