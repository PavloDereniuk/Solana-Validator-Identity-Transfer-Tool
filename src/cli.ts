#!/usr/bin/env node
import { Command } from 'commander';

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
  .description('show state of both nodes')
  .action(async () => {
    console.log('status: not implemented yet');
  });

program.parseAsync(process.argv);
