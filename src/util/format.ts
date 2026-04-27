import chalk from 'chalk';
import type { CheckLevel, PreflightReport } from '../core/preflight.js';

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
