import { Client } from 'ssh2';
import { readFile } from 'node:fs/promises';

export type Target = {
  host: string;
  port: number;
  user: string;
  keyPath: string;
};

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number;
};

async function connect(t: Target): Promise<Client> {
  const key = await readFile(t.keyPath);
  const conn = new Client();
  await new Promise<void>((resolve, reject) => {
    conn.once('ready', resolve);
    conn.once('error', reject);
    conn.connect({
      host: t.host,
      port: t.port,
      username: t.user,
      privateKey: key,
    });
  });
  return conn;
}

export async function exec(t: Target, cmd: string, stdin?: string): Promise<ExecResult> {
  const conn = await connect(t);
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { conn.end(); return reject(err); }
      let out = '';
      let errOut = '';
      stream.on('data', (b: Buffer) => { out += b.toString(); });
      stream.stderr.on('data', (b: Buffer) => { errOut += b.toString(); });
      stream.on('close', (code: number) => {
        conn.end();
        resolve({ stdout: out, stderr: errOut, code });
      });
      if (stdin !== undefined) stream.end(stdin);
    });
  });
}

export async function readRemote(t: Target, remotePath: string): Promise<Buffer> {
  const conn = await connect(t);
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { conn.end(); return reject(err); }
      const chunks: Buffer[] = [];
      const stream = sftp.createReadStream(remotePath);
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => { conn.end(); resolve(Buffer.concat(chunks)); });
      stream.on('error', (e: Error) => { conn.end(); reject(e); });
    });
  });
}

export async function writeRemote(t: Target, remotePath: string, data: Buffer): Promise<void> {
  const conn = await connect(t);
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { conn.end(); return reject(err); }
      const stream = sftp.createWriteStream(remotePath);
      stream.on('finish', () => { conn.end(); resolve(); });
      stream.on('error', (e: Error) => { conn.end(); reject(e); });
      stream.end(data);
    });
  });
}
