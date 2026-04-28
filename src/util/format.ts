import chalk from 'chalk';
import type { CheckLevel, PreflightReport } from '../core/preflight.js';
import type { SwapStep } from '../core/swap.js';

const ICONS: Record<CheckLevel, string> = {
  pass: chalk.green('ok '),
  warn: chalk.yellow('warn'),
  fail: chalk.red('FAIL'),
};

export function formatPreflight(r: PreflightReport): string {
  const widest = r.results.reduce((w, c) => Math.max(w, c.name.length), 0);
  const lines: string[] = ['checks:'];
  for (const c of r.results) {
    lines.push(`  [${ICONS[c.level]}] ${c.name.padEnd(widest)}   ${c.message}`);
    if (c.detail && c.level !== 'pass') {
      for (const ln of c.detail.split('\n')) lines.push(`         ${chalk.dim(ln)}`);
    }
  }

  const score = r.score;
  const scoreColor = score >= 90 ? chalk.green : score >= 70 ? chalk.yellow : chalk.red;
  const recColor = r.recommendation === 'go' ? chalk.green
    : r.recommendation === 'wait' ? chalk.yellow
    : chalk.red;

  lines.push('');
  lines.push(`score: ${scoreColor(`${score}/100`)}   recommendation: ${recColor(r.recommendation.toUpperCase())}`);
  lines.push('');
  return lines.join('\n');
}

export function formatDryRun(steps: SwapStep[], stakedPubkey: string): string {
  const out: string[] = [];
  out.push(chalk.bold(`dry-run: ${steps.length} steps. nothing will be executed.`));
  out.push(chalk.dim(`staked identity: ${stakedPubkey}`));
  out.push('');

  for (let i = 0; i < steps.length; i += 1) {
    const s = steps[i];
    out.push(chalk.cyan(`[${i + 1}/${steps.length}] ${s.label}`));
    for (const ln of s.lines) {
      out.push(chalk.dim(`  on ${ln.host}:`));
      out.push(`    $ ${ln.command}`);
      if (ln.stdinFrom === 'tower-base64') {
        out.push(chalk.dim(`    (stdin: base64 stream from previous command)`));
      }
    }
    out.push('');
  }

  out.push(chalk.yellow('to verify safety beforehand, run: vid preflight --config <path>'));
  out.push('');
  return out.join('\n');
}
