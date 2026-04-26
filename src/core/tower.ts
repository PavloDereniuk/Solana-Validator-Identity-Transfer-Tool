import { readRemote, writeRemote, type Target } from './ssh.js';

export function towerFilename(pubkey: string): string {
  return `tower-1_9-${pubkey}.bin`;
}

export async function transferTower(
  from: Target,
  to: Target,
  fromLedger: string,
  toLedger: string,
  pubkey: string
): Promise<number> {
  const file = towerFilename(pubkey);
  const data = await readRemote(from, `${fromLedger}/${file}`);
  await writeRemote(to, `${toLedger}/${file}`, data);
  return data.byteLength;
}
