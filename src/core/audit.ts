import { createHash } from 'node:crypto';
import { open, type FileHandle } from 'node:fs/promises';

export type AuditEvent = {
  ts: string;
  swapId: string;
  step: string;
  host?: string;
  command?: string;
  exit?: number;
  durationMs?: number;
  stdoutSha?: string;
  stderrSha?: string;
  message?: string;
  error?: string;
};

export class Auditor {
  constructor(private fh: FileHandle, public readonly swapId: string) {}

  static async open(path: string, swapId: string): Promise<Auditor> {
    const fh = await open(path, 'a');
    return new Auditor(fh, swapId);
  }

  async write(ev: Omit<AuditEvent, 'ts' | 'swapId'>): Promise<void> {
    const full: AuditEvent = {
      ts: new Date().toISOString(),
      swapId: this.swapId,
      ...ev,
    };
    await this.fh.write(JSON.stringify(full) + '\n');
    await this.fh.sync();
  }

  async close(): Promise<void> {
    await this.fh.close();
  }
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function newSwapId(): string {
  // short, sortable id: yyyymmdd-hhmmss-rand
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const d =
    now.getUTCFullYear().toString() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    '-' +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds());
  const rand = Math.random().toString(36).slice(2, 6);
  return `${d}-${rand}`;
}

export function defaultAuditPath(prefix = 'audit'): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${prefix}-${today}.jsonl`;
}
