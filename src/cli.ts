#!/usr/bin/env node
import { Command } from 'commander';
import { exec, type Target } from './core/ssh.js';
import { loadConfig, nodeToTarget } from './config.js';
import { runChecks, type PreflightReport } from './core/preflight.js';
import { buildSwapChecks } from './core/checks.js';
import { executeSwap } from './core/swap.js';
import { Auditor, defaultAuditPath, newSwapId } from './core/audit.js';

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
  .requiredOption('-c, --config <path>', 'swap config json')
  .action(async (opts) => {
    const cfg = await loadConfig(opts.config);
    const report = await runChecks(buildSwapChecks(cfg));
    printReport(report);
    if (report.recommendation === 'no-go') process.exit(1);
  });

function printReport(r: PreflightReport): void {
  const symbol = (l: string) => (l === 'pass' ? 'ok ' : l === 'warn' ? 'warn' : 'FAIL');
  for (const c of r.results) {
    console.log(`  [${symbol(c.level)}] ${c.name.padEnd(28)} ${c.message}`);
    if (c.detail && c.level !== 'pass') {
      for (const line of c.detail.split('\n')) console.log(`         ${line}`);
    }
  }
  console.log('');
  console.log(`  score: ${r.score}/100   recommendation: ${r.recommendation.toUpperCase()}`);
}

program
  .command('swap')
  .description('transfer identity from primary to secondary')
  .requiredOption('-c, --config <path>', 'swap config json')
  .option('--dry-run', 'print commands without executing')
  .option('--audit-log <path>', 'append-only jsonl audit file', defaultAuditPath())
  .action(async (opts) => {
    const cfg = await loadConfig(opts.config);

    const primary = { target: nodeToTarget(cfg.primary), ledger: cfg.primary.ledger };
    const secondary = { target: nodeToTarget(cfg.secondary), ledger: cfg.secondary.ledger };

    if (opts.dryRun) {
      console.log('dry-run: not yet wired up. coming soon.');
      return;
    }

    const audit = await Auditor.open(opts.auditLog, newSwapId());
    try {
      const { stakedPubkey } = await executeSwap(
        {
          from: primary,
          to: secondary,
          stakedKeyfile: cfg.identities.staked,
          unstakedKeyfile: cfg.identities.unstaked,
        },
        {
          audit,
          onStep: (n, total, label) => console.log(`[${n}/${total}] ${label}...`),
        },
      );
      console.log(`done. staked identity ${stakedPubkey} now active on secondary.`);
      console.log(`audit: ${opts.auditLog} (swap ${audit.swapId})`);
    } catch (e) {
      await audit.write({ step: 'swap-error', error: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      await audit.close();
    }
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
