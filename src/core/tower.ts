import { exec, type Target } from './ssh.js';

export function towerFilename(pubkey: string): string {
  return `tower-1_9-${pubkey}.bin`;
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
  const file = towerFilename(pubkey);
  const fromPath = `${fromLedger}/${file}`;
  const toPath = `${toLedger}/${file}`;

  const r = await exec(from, `base64 -w0 < ${fromPath}`);
  if (r.code !== 0) {
    throw new Error(`read tower from primary failed: ${r.stderr || r.stdout}`);
  }
  const b64 = r.stdout.trim();

  const w = await exec(to, `base64 -d > ${toPath}`, b64);
  if (w.code !== 0) {
    throw new Error(`write tower to secondary failed: ${w.stderr || w.stdout}`);
  }

  return Buffer.from(b64, 'base64').byteLength;
}
