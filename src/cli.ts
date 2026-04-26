#!/usr/bin/env node
import { Command } from 'commander';
import { exec, type Target } from './core/ssh.js';

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
  .option('--dry-run', 'print commands without executing')
  .action(async (opts) => {
    console.log('swap: not implemented yet', opts);
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
