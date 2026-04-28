import React from 'react';
import { Box, Text } from 'ink';
import { Header } from './Header.js';
import { ValidatorPanel } from './ValidatorPanel.js';
import { SwapProgress } from './SwapProgress.js';
import { AuditTail } from './AuditTail.js';
import { useTuiStore, type TuiStore } from './store.js';
import type { SwapConfig } from '../config.js';
import { nodeToTarget } from '../config.js';

export type AppProps = {
  cfg: SwapConfig;
  expectedStaked?: string;
  store: TuiStore;
  auditPath?: string;
};

function hostLabel(n: { user: string; host: string; port: number }): string {
  return `${n.user}@${n.host}:${n.port}`;
}

export function App({ cfg, expectedStaked, store, auditPath }: AppProps) {
  const s = useTuiStore(store);
  const swapInFlight = s.outcome.kind === 'running';

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Header
        primary={hostLabel(cfg.primary)}
        secondary={hostLabel(cfg.secondary)}
      />

      {s.banner && (
        <Box marginBottom={1}>
          <Text color="cyan">{s.banner}</Text>
        </Box>
      )}

      <Box gap={2}>
        <ValidatorPanel
          label="PRIMARY"
          badgeColor="cyan"
          target={nodeToTarget(cfg.primary)}
          ledger={cfg.primary.ledger}
          paused={swapInFlight}
          expectedStaked={expectedStaked}
        />
        <ValidatorPanel
          label="SECONDARY"
          badgeColor="magenta"
          target={nodeToTarget(cfg.secondary)}
          ledger={cfg.secondary.ledger}
          paused={swapInFlight}
          expectedStaked={expectedStaked}
        />
      </Box>

      <SwapProgress steps={s.steps} />

      {auditPath && <AuditTail path={auditPath} />}

      <Box marginTop={1}>
        {s.outcome.kind === 'done' && <Text color="green">{s.outcome.message}  (press ctrl-c to exit)</Text>}
        {s.outcome.kind === 'fail' && <Text color="red">{s.outcome.message}  (press ctrl-c to exit)</Text>}
        {s.outcome.kind === 'rolled-back' && <Text color="yellow">{s.outcome.message}  (press ctrl-c to exit)</Text>}
        {s.outcome.kind === 'idle' && <Text color="dim">ctrl-c to exit. polling every 5s.</Text>}
        {s.outcome.kind === 'running' && <Text color="yellow">swap in progress…</Text>}
      </Box>
    </Box>
  );
}
