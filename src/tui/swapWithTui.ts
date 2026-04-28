import { startTui } from './runTui.js';
import { executeSwap, planSwap, resolveStakedPubkey, type SwapPlan } from '../core/swap.js';
import { watchCatchup, type WatchOpts } from '../core/rollback.js';
import { Auditor } from '../core/audit.js';
import { nodeToTarget, type SwapConfig } from '../config.js';
import type { StepState } from './store.js';

export type SwapWithTuiOpts = {
  cfg: SwapConfig;
  audit: Auditor;
  auditPath: string;
  incidentPath: string;
  watch?: WatchOpts;
  enableRollback: boolean;
};

export async function swapWithTui(opts: SwapWithTuiOpts): Promise<number> {
  const { cfg, audit, auditPath, incidentPath, enableRollback, watch: watchOpts } = opts;

  const primary = { target: nodeToTarget(cfg.primary),   ledger: cfg.primary.ledger };
  const secondary = { target: nodeToTarget(cfg.secondary), ledger: cfg.secondary.ledger };
  const swapPlan: SwapPlan = {
    from: primary,
    to: secondary,
    stakedKeyfile: cfg.identities.staked,
    unstakedKeyfile: cfg.identities.unstaked,
  };

  const stakedPubkey = await resolveStakedPubkey(swapPlan);
  const planSteps = planSwap(swapPlan, { stakedPubkey });

  const tui = startTui({ cfg, expectedStaked: stakedPubkey, auditPath });

  const initial: StepState[] = planSteps.map((s) => ({ id: s.id, label: s.label, status: 'pending' }));
  tui.store.setSteps(initial);
  tui.store.setOutcome({ kind: 'running' });
  tui.store.setBanner(`staked identity: ${stakedPubkey}`);

  const stepStartedAt = new Map<number, number>();

  try {
    await executeSwap(swapPlan, {
      audit,
      onStep: (n, _total, _label) => {
        // mark the previous step as done
        if (n > 1) {
          const prev = planSteps[n - 2].id;
          const startedAt = stepStartedAt.get(n - 1) ?? Date.now();
          tui.store.updateStep(prev, { status: 'done', durationMs: Date.now() - startedAt });
        }
        stepStartedAt.set(n, Date.now());
        tui.store.updateStep(planSteps[n - 1].id, { status: 'running' });
      },
    });

    // close out the final step (executeSwap doesn't fire onStep after the last one)
    const last = planSteps[planSteps.length - 1].id;
    const lastStart = stepStartedAt.get(planSteps.length) ?? Date.now();
    tui.store.updateStep(last, { status: 'done', durationMs: Date.now() - lastStart });

    if (!enableRollback) {
      tui.store.setOutcome({ kind: 'done', message: `swap complete (no catchup watcher).` });
      await tui.waitForExit();
      return 0;
    }

    tui.store.setBanner(`watching secondary catchup (timeout=${(watchOpts!.timeoutMs / 1000)}s)...`);
    const watch = await watchCatchup(secondary.target, watchOpts!);
    await audit.write({
      step: 'catchup-watch',
      host: `${secondary.target.host}:${secondary.target.port}`,
      message: `converged=${watch.converged} lastSlots=${watch.lastSlotsBehind} samples=${watch.samples}`,
    });

    if (watch.converged) {
      tui.store.setOutcome({
        kind: 'done',
        message: `secondary caught up (${watch.lastSlotsBehind} slots behind).`,
      });
      await tui.waitForExit();
      return 0;
    }

    // catchup didn't converge — auto-rollback
    tui.store.setBanner(`catchup failed: ${watch.reason}. rolling identity back to primary…`);
    const incident = await Auditor.open(incidentPath, audit.swapId);
    try {
      await incident.write({ step: 'rollback-start', message: watch.reason });
      const rollbackSteps = planSwap({ ...swapPlan, from: secondary, to: primary }, { stakedPubkey });
      tui.store.setSteps(rollbackSteps.map((s) => ({ id: 'rb-' + s.id, label: 'rollback: ' + s.label, status: 'pending' })));
      const rbStart = new Map<number, number>();

      await executeSwap(
        { ...swapPlan, from: secondary, to: primary },
        {
          audit: incident,
          onStep: (n) => {
            if (n > 1) {
              const prev = 'rb-' + rollbackSteps[n - 2].id;
              const startedAt = rbStart.get(n - 1) ?? Date.now();
              tui.store.updateStep(prev, { status: 'done', durationMs: Date.now() - startedAt });
            }
            rbStart.set(n, Date.now());
            tui.store.updateStep('rb-' + rollbackSteps[n - 1].id, { status: 'running' });
          },
        },
      );
      const rbLast = 'rb-' + rollbackSteps[rollbackSteps.length - 1].id;
      const rbLastStart = rbStart.get(rollbackSteps.length) ?? Date.now();
      tui.store.updateStep(rbLast, { status: 'done', durationMs: Date.now() - rbLastStart });
      await incident.write({ step: 'rollback-complete' });
    } finally {
      await incident.close();
    }

    tui.store.setOutcome({
      kind: 'rolled-back',
      message: `rolled back. primary holds the staked identity again. incident: ${incidentPath}`,
    });
    await tui.waitForExit();
    return 2;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await audit.write({ step: 'swap-error', error: msg });
    tui.store.setOutcome({ kind: 'fail', message: `swap error: ${msg}` });
    await tui.waitForExit();
    return 1;
  }
}
