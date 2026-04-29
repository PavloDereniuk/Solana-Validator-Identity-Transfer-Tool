import prompts from 'prompts';
import chalk from 'chalk';
import { writeFile, access } from 'node:fs/promises';
import { exec, type Target } from '../core/ssh.js';
import type { SwapConfig } from '../config.js';

const DEFAULTS = {
  user: 'sol',
  port: 22,
  ledger: '/home/sol/ledger',
  staked: '/home/sol/staked.json',
  unstaked: '/home/sol/unstaked.json',
};

type AnswersForSide = {
  host: string;
  port: number;
  user: string;
  key: string;
  ledger: string;
};

async function askSide(side: 'primary' | 'secondary'): Promise<AnswersForSide> {
  console.log(chalk.bold(`\n${side} validator`));
  const r = await prompts([
    { type: 'text',   name: 'host',   message: `${side} host`,    validate: (v: string) => v.length > 0 || 'required' },
    { type: 'number', name: 'port',   message: `${side} ssh port`, initial: DEFAULTS.port },
    { type: 'text',   name: 'user',   message: `${side} ssh user`, initial: DEFAULTS.user },
    { type: 'text',   name: 'key',    message: `${side} ssh private key path`, validate: (v: string) => v.length > 0 || 'required' },
    { type: 'text',   name: 'ledger', message: `${side} ledger directory`, initial: DEFAULTS.ledger },
  ], { onCancel: () => process.exit(130) });
  return r as AnswersForSide;
}

async function probe(t: Target): Promise<{ ok: boolean; detail: string }> {
  try {
    const r = await exec(t, 'agave-validator --version || true');
    if (r.code !== 0 && !r.stdout.trim()) {
      return { ok: false, detail: r.stderr.trim() || `exit ${r.code}` };
    }
    return { ok: true, detail: r.stdout.trim() || 'reachable' };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function asTarget(s: AnswersForSide): Target {
  return { host: s.host, port: s.port, user: s.user, keyPath: s.key };
}

export async function runInit(outPath: string): Promise<void> {
  console.log(chalk.bold('vid init') + ' — build a swap-config.json interactively.');
  console.log(chalk.dim('Ctrl+C to abort. existing files will not be overwritten without confirmation.'));

  let willOverwrite = false;
  try {
    await access(outPath);
    willOverwrite = true;
  } catch {
    // doesn't exist, fine
  }

  if (willOverwrite) {
    const c = await prompts({
      type: 'confirm',
      name: 'ok',
      message: `${outPath} already exists. overwrite?`,
      initial: false,
    }, { onCancel: () => process.exit(130) });
    if (!c.ok) {
      console.log('aborted.');
      return;
    }
  }

  const primary = await askSide('primary');
  const secondary = await askSide('secondary');

  console.log(chalk.bold('\nidentity keypairs (paths on the validator hosts)'));
  const ids = await prompts([
    { type: 'text', name: 'staked',   message: 'staked keypair file (same path on both)',   initial: DEFAULTS.staked },
    { type: 'text', name: 'unstaked', message: 'unstaked junk keypair file (on primary)',    initial: DEFAULTS.unstaked },
  ], { onCancel: () => process.exit(130) });

  const cfg: SwapConfig = {
    primary: { host: primary.host, port: primary.port, user: primary.user, key: primary.key, ledger: primary.ledger },
    secondary: { host: secondary.host, port: secondary.port, user: secondary.user, key: secondary.key, ledger: secondary.ledger },
    identities: { staked: ids.staked, unstaked: ids.unstaked },
  };

  const probeAns = await prompts({
    type: 'confirm',
    name: 'probe',
    message: 'probe ssh on both nodes now?',
    initial: true,
  }, { onCancel: () => process.exit(130) });

  if (probeAns.probe) {
    console.log('');
    for (const [side, t] of [['primary', asTarget(primary)], ['secondary', asTarget(secondary)]] as const) {
      process.stdout.write(`  ${side.padEnd(9)} `);
      const r = await probe(t);
      if (r.ok) {
        console.log(chalk.green('ok ') + chalk.dim(r.detail));
      } else {
        console.log(chalk.red('fail ') + chalk.dim(r.detail));
      }
    }
    console.log('');
  }

  await writeFile(outPath, JSON.stringify(cfg, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  console.log(`wrote ${outPath} (0600).`);
  console.log(`next: ${chalk.cyan(`vid preflight --config ${outPath}`)}`);
}
