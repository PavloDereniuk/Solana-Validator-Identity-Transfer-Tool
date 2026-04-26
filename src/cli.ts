#!/usr/bin/env node
import { Command } from 'commander';
import { exec, type Target } from './core/ssh.js';
import { setIdentity, waitForRestartWindow, getPubkey } from './core/validator.js';
import { transferTower } from './core/tower.js';
import { loadConfig, nodeToTarget } from './config.js';

const program = new Command();

program
  .name('vid')
  .description('Solana validator identity transfer')
  .version('0.1.0');

program
  .command('init')
  .description('interactive config wizard')
  .action(async () => {
    console.log('init: not implemented yet');
  });

program
  .command('preflight')
  .description('run pre-swap safety checks')
  .action(async () => {
    console.log('preflight: not implemented yet');
  });

program
  .command('swap')
  .description('transfer identity from primary to secondary')
  .requiredOption('-c, --config <path>', 'swap config json')
  .option('--dry-run', 'print commands without executing')
  .action(async (opts) => {
    const cfg = await loadConfig(opts.config);

    const primary = { target: nodeToTarget(cfg.primary), ledger: cfg.primary.ledger };
    const secondary = { target: nodeToTarget(cfg.secondary), ledger: cfg.secondary.ledger };

    if (opts.dryRun) {
      console.log('dry-run: not yet wired up. coming soon.');
      return;
    }

    const stakedPubkey = await getPubkey(primary.target, cfg.identities.staked);
    console.log(`staked identity: ${stakedPubkey}`);

    console.log('[1/4] waiting for restart window on primary...');
    await waitForRestartWindow(primary, { minIdleTime: 2, skipSnapshotCheck: true });

    console.log('[2/4] switching primary to unstaked identity...');
    await setIdentity(primary, cfg.identities.unstaked);

    console.log('[3/4] transferring tower file primary -> secondary...');
    const bytes = await transferTower(
      primary.target, secondary.target,
      cfg.primary.ledger, cfg.secondary.ledger,
      stakedPubkey,
    );
    console.log(`         tower transferred (${bytes} bytes)`);

    console.log('[4/4] activating staked identity on secondary (require-tower)...');
    await setIdentity(secondary, cfg.identities.staked, { requireTower: true });

    console.log('done.');
  });

program
  .command('status')
  .description('show validator state on a host')
  .requiredOption('-H, --host <host>', 'ssh host')
  .option('-p, --port <port>', 'ssh port', '22')
  .option('-u, --user <user>', 'ssh user', 'sol')
  .requiredOption('-k, --key <path>', 'ssh private key')
  .action(async (opts) => {
    const t: Target = {
      host: opts.host,
      port: Number(opts.port),
      user: opts.user,
      keyPath: opts.key,
    };
    const v = await exec(t, 'agave-validator --version');
    const s = await exec(t, 'solana --version');
    console.log(`host:   ${t.host}:${t.port}`);
    console.log(`agave:  ${v.stdout.trim() || v.stderr.trim()}`);
    console.log(`solana: ${s.stdout.trim() || s.stderr.trim()}`);
  });

program.parseAsync(process.argv);
