import { readFile } from 'node:fs/promises';
import type { Target } from './core/ssh.js';

export type NodeConfig = {
  host: string;
  port: number;
  user: string;
  key: string;
  ledger: string;
};

export type SwapConfig = {
  primary: NodeConfig;
  secondary: NodeConfig;
  identities: {
    staked: string;
    unstaked: string;
  };
};

export async function loadConfig(path: string): Promise<SwapConfig> {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as SwapConfig;
  // TODO proper schema validation. for now trust the json.
  for (const side of ['primary', 'secondary'] as const) {
    if (!parsed[side]?.host || !parsed[side]?.port) {
      throw new Error(`config: ${side}.host and ${side}.port are required`);
    }
  }
  return parsed;
}

export function nodeToTarget(n: NodeConfig): Target {
  return { host: n.host, port: n.port, user: n.user, keyPath: n.key };
}
