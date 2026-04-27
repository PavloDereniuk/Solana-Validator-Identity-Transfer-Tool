#!/usr/bin/env node
import { Command } from 'commander';
import { exec, type Target } from './core/ssh.js';
import { loadConfig, nodeToTarget } from './config.js';
import { runChecks, type PreflightReport } from './core/preflight.js';
import { buildSwapChecks } from './core/checks.js';
import { executeSwap } from './core/swap.js';
import { Auditor, defaultAuditPath, newSwapId } from './core/audit.js';
import { watchCatchup, DEFAULT_WATCH } from './core/rollback.js';

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
  const widest = r.results.reduce((w, c) => Math.max(w, c.name.length), 0);
  console.log('checks:');
  for (const c of r.results) {
    console.log(`  [${symbol(c.level)}] ${c.name.padEnd(widest)}   ${c.message}`);
    if (c.detail && c.level !== 'pass') {
      for (const line of c.detail.split('\n')) console.log(`         ${line}`);
    }
  }
  console.log(`\nscore: ${r.score}/100   recommendation: ${r.recommendation.toUpperCase()}\n`);
}

program
  .command('swap')
  .description('transfer identity from primary to secondary')
  .requiredOption('-c, --config <path>', 'swap config json')
  .option('--dry-run', 'print commands without executing')
  .option('--audit-log <path>', 'append-only jsonl audit file', defaultAuditPath())
  .option('--no-rollback', 'disable post-swap catchup watcher and auto-rollback')
  .option('--catchup-timeout <sec>', 'how long to wait for the new node to catch up', String(DEFAULT_WATCH.timeoutMs / 1000))
  .option('--catchup-threshold <slots>', 'slots-behind threshold to count as caught up', String(DEFAULT_WATCH.slotThreshold))
  .option('--skip-preflight', 'do not run preflight before the swap (not recommended)')
  .option('--preflight-min-score <n>', 'minimum preflight score required to proceed', '90')
  .action(async (opts) => {
    const cfg = await loadConfig(opts.config);

    const primary = { target: nodeToTarget(cfg.primary), ledger: cfg.primary.ledger };
    const secondary = { target: nodeToTarget(cfg.secondary), ledger: cfg.secondary.ledger };

    if (opts.dryRun) {
      console.log('dry-run: not yet wired up. coming soon.');
      return;
    }

    if (!opts.skipPreflight) {
      console.log('running preflight...');
      const report = await runChecks(buildSwapChecks(cfg));
      printReport(report);
      const minScore = Number(opts.preflightMinScore);
      if (report.recommendation === 'no-go' || report.score < minScore) {
        console.error(`\npreflight blocked: score ${report.score} < ${minScore} or recommendation=${report.recommendation}.`);
        console.error('rerun with --skip-preflight to override (you should not).');
        process.exit(1);
      }
      console.log('');
    }

    const audit = await Auditor.open(opts.auditLog, newSwapId());
    const incidentPath = opts.auditLog.replace(/^audit-/, 'incident-');

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
      console.log(`swap done. staked identity ${stakedPubkey} now active on secondary.`);

      if (opts.rollback === false) {
        console.log(`skipping catchup watcher (--no-rollback)`);
        console.log(`audit: ${opts.auditLog} (swap ${audit.swapId})`);
        return;
      }

      const watchOpts = {
        timeoutMs: Number(opts.catchupTimeout) * 1000,
        intervalMs: DEFAULT_WATCH.intervalMs,
        slotThreshold: Number(opts.catchupThreshold),
      };
      console.log(`watching secondary catchup (timeout=${watchOpts.timeoutMs / 1000}s, threshold=${watchOpts.slotThreshold} slots)...`);
      const watch = await watchCatchup(secondary.target, watchOpts);
      await audit.write({
        step: 'catchup-watch',
        host: `${secondary.target.host}:${secondary.target.port}`,
        message: `converged=${watch.converged} lastSlots=${watch.lastSlotsBehind} samples=${watch.samples}`,
      });

      if (watch.converged) {
        console.log(`secondary caught up (${watch.lastSlotsBehind} slots behind).`);
        console.log(`audit: ${opts.auditLog} (swap ${audit.swapId})`);
        return;
      }

      console.error(`secondary did NOT catch up: ${watch.reason}`);
      console.error(`rolling identity back to primary...`);
      const incident = await Auditor.open(incidentPath, audit.swapId);
      try {
        await incident.write({ step: 'rollback-start', message: watch.reason });
        await executeSwap(
          {
            from: secondary,
            to: primary,
            stakedKeyfile: cfg.identities.staked,
            unstakedKeyfile: cfg.identities.unstaked,
          },
          {
            audit: incident,
            onStep: (n, total, label) => console.log(`[rollback ${n}/${total}] ${label}...`),
          },
        );
        await incident.write({ step: 'rollback-complete' });
        console.log(`rollback complete. primary holds the staked identity again.`);
        console.log(`incident: ${incidentPath}`);
        process.exit(2);
      } finally {
        await incident.close();
      }
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
