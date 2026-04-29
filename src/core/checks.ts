import { exec, type Target } from './ssh.js';
import { towerFilename } from './tower.js';
import type { Check } from './preflight.js';
import type { SwapConfig } from '../config.js';
import { nodeToTarget } from '../config.js';

type Side = 'primary' | 'secondary';

function host(t: Target): string {
  return `${t.user}@${t.host}:${t.port}`;
}

export function sshReachable(side: Side, t: Target): Check {
  return {
    name: `ssh-${side}`,
    weight: 5,
    run: async () => {
      try {
        const r = await exec(t, 'true');
        if (r.code !== 0) {
          return { level: 'fail', message: `ssh ok but remote exited ${r.code}`, detail: r.stderr };
        }
        return { level: 'pass', message: `reachable at ${host(t)}` };
      } catch (e) {
        return {
          level: 'fail',
          message: `cannot ssh to ${host(t)}`,
          detail: e instanceof Error ? e.message : String(e),
        };
      }
    },
  };
}

export function binariesPresent(side: Side, t: Target): Check {
  return {
    name: `binaries-${side}`,
    weight: 4,
    run: async () => {
      const r = await exec(t, 'command -v agave-validator >/dev/null && command -v solana >/dev/null && echo ok');
      if (r.code === 0 && r.stdout.trim() === 'ok') {
        return { level: 'pass', message: 'agave-validator and solana on PATH' };
      }
      return {
        level: 'fail',
        message: 'agave-validator or solana not on PATH',
        detail: r.stderr || r.stdout,
      };
    },
  };
}

export function ledgerWritable(side: Side, t: Target, ledger: string): Check {
  return {
    name: `ledger-${side}`,
    weight: 3,
    run: async () => {
      const r = await exec(t, `test -d ${ledger} && test -w ${ledger} && echo ok`);
      if (r.code === 0 && r.stdout.trim() === 'ok') {
        return { level: 'pass', message: `${ledger} exists and is writable` };
      }
      return {
        level: 'fail',
        message: `ledger ${ledger} missing or not writable`,
        detail: r.stderr || r.stdout,
      };
    },
  };
}

export function keypairExists(name: string, t: Target, path: string, weight = 3): Check {
  return {
    name,
    weight,
    run: async () => {
      const r = await exec(t, `test -f ${path} && echo ok`);
      if (r.code === 0 && r.stdout.trim() === 'ok') {
        return { level: 'pass', message: `${path} present` };
      }
      return { level: 'fail', message: `${path} missing on ${host(t)}` };
    },
  };
}

export function identitiesDistinct(t: Target, staked: string, unstaked: string): Check {
  return {
    name: 'identities-distinct',
    weight: 3,
    run: async () => {
      const a = await exec(t, `solana address -k ${staked}`);
      const b = await exec(t, `solana address -k ${unstaked}`);
      if (a.code !== 0 || b.code !== 0) {
        return {
          level: 'fail',
          message: 'could not read pubkey for one of the identities',
          detail: (a.stderr + b.stderr).trim(),
        };
      }
      const sa = a.stdout.trim();
      const sb = b.stdout.trim();
      if (sa === sb) {
        return {
          level: 'fail',
          message: 'staked and unstaked identities resolve to the same pubkey',
          detail: `both = ${sa}`,
        };
      }
      return { level: 'pass', message: `staked != unstaked (${sa.slice(0, 8)}.. vs ${sb.slice(0, 8)}..)` };
    },
  };
}

export function towerPresent(t: Target, ledger: string, stakedKeyfile: string): Check {
  return {
    name: 'tower-primary',
    weight: 5,
    run: async () => {
      const a = await exec(t, `solana address -k ${stakedKeyfile}`);
      if (a.code !== 0) {
        return { level: 'fail', message: 'cannot derive staked pubkey for tower lookup', detail: a.stderr };
      }
      const pub = a.stdout.trim();
      const file = `${ledger}/${towerFilename(pub)}`;
      // -s also catches the zero-byte case (mid-write, truncated, etc).
      const r = await exec(t, `test -s ${file} && wc -c < ${file}`);
      if (r.code === 0) {
        const size = Number(r.stdout.trim()) || 0;
        return { level: 'pass', message: `${towerFilename(pub)} present (${size}B)` };
      }
      return {
        level: 'fail',
        message: `tower file missing or empty on primary: ${file}`,
        detail: 'without a non-empty tower the secondary cannot resume voting safely',
      };
    },
  };
}

export function validatorAlive(side: Side, t: Target, ledger: string): Check {
  return {
    name: `monitor-${side}`,
    weight: 4,
    run: async () => {
      const r = await exec(t, `agave-validator -l ${ledger} monitor`);
      const out = r.stdout + r.stderr;
      const m = out.match(/slot\s+(\d+)/i);
      if (r.code !== 0 || !m) {
        return { level: 'fail', message: 'validator not responding to monitor', detail: out.trim() };
      }
      return { level: 'pass', message: `live, slot ${m[1]}` };
    },
  };
}

export function clusterVersionMatch(primary: Target, secondary: Target): Check {
  return {
    name: 'cluster-version',
    weight: 1,
    run: async () => {
      const a = await exec(primary, 'agave-validator --version');
      const b = await exec(secondary, 'agave-validator --version');
      if (a.code !== 0 || b.code !== 0) {
        return { level: 'warn', message: 'could not read version on one side', detail: a.stderr || b.stderr };
      }
      const va = a.stdout.trim();
      const vb = b.stdout.trim();
      if (va === vb) return { level: 'pass', message: `both on ${va}` };
      return {
        level: 'warn',
        message: 'agave-validator versions differ',
        detail: `primary: ${va} | secondary: ${vb}`,
      };
    },
  };
}

export function buildSwapChecks(cfg: SwapConfig): Check[] {
  const primary = nodeToTarget(cfg.primary);
  const secondary = nodeToTarget(cfg.secondary);
  return [
    sshReachable('primary', primary),
    sshReachable('secondary', secondary),
    binariesPresent('primary', primary),
    binariesPresent('secondary', secondary),
    ledgerWritable('primary', primary, cfg.primary.ledger),
    ledgerWritable('secondary', secondary, cfg.secondary.ledger),
    keypairExists('staked-keypair-primary', primary, cfg.identities.staked),
    keypairExists('staked-keypair-secondary', secondary, cfg.identities.staked),
    keypairExists('unstaked-keypair-primary', primary, cfg.identities.unstaked, 2),
    identitiesDistinct(primary, cfg.identities.staked, cfg.identities.unstaked),
    towerPresent(primary, cfg.primary.ledger, cfg.identities.staked),
    validatorAlive('primary', primary, cfg.primary.ledger),
    clusterVersionMatch(primary, secondary),
  ];
}
