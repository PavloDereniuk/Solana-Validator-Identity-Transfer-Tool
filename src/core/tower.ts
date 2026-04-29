import { exec, type Target } from './ssh.js';

export function towerFilename(pubkey: string): string {
  return `tower-1_9-${pubkey}.bin`;
}

export function cmdReadTower(fromLedger: string, pubkey: string): string {
  return `base64 -w0 < ${fromLedger}/${towerFilename(pubkey)}`;
}

export function cmdWriteTower(toLedger: string, pubkey: string): string {
  return `base64 -d > ${toLedger}/${towerFilename(pubkey)}`;
}

// streams the tower file over an exec channel as base64.
// originally tried sftp here but createReadStream hung on small files in
// some environments. exec+base64 is what most validator switch tools use too.
export async function transferTower(
  from: Target,
  to: Target,
  fromLedger: string,
  toLedger: string,
  pubkey: string
): Promise<number> {
  const r = await exec(from, cmdReadTower(fromLedger, pubkey));
  if (r.code !== 0) {
    throw new Error(`read tower from primary failed: ${r.stderr || r.stdout}`);
  }
  const b64 = r.stdout.trim();
  if (b64.length === 0) {
    // either the file is zero bytes (pre-flight should have caught this),
    // or base64 produced no output for some other reason. either way we
    // refuse — pushing an empty tower forward is worse than not swapping.
    throw new Error(`refused: tower file at ${fromLedger}/tower-1_9-${pubkey}.bin is empty`);
  }

  const w = await exec(to, cmdWriteTower(toLedger, pubkey), b64);
  if (w.code !== 0) {
    throw new Error(`write tower to secondary failed: ${w.stderr || w.stdout}`);
  }

  return Buffer.from(b64, 'base64').byteLength;
}
