import React from 'react';
import { Box, Text } from 'ink';
import { Header } from './Header.js';
import { ValidatorPanel } from './ValidatorPanel.js';
import type { SwapConfig } from '../config.js';
import { nodeToTarget } from '../config.js';

export type AppProps = {
  cfg: SwapConfig;
  expectedStaked?: string;
  paused?: boolean;
};

function hostLabel(n: { user: string; host: string; port: number }): string {
  return `${n.user}@${n.host}:${n.port}`;
}

export function App({ cfg, expectedStaked, paused }: AppProps) {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Header
        primary={hostLabel(cfg.primary)}
        secondary={hostLabel(cfg.secondary)}
      />
      <Box gap={2}>
        <ValidatorPanel
          label="PRIMARY"
          badgeColor="cyan"
          target={nodeToTarget(cfg.primary)}
          ledger={cfg.primary.ledger}
          paused={paused}
          expectedStaked={expectedStaked}
        />
        <ValidatorPanel
          label="SECONDARY"
          badgeColor="magenta"
          target={nodeToTarget(cfg.secondary)}
          ledger={cfg.secondary.ledger}
          paused={paused}
          expectedStaked={expectedStaked}
        />
      </Box>
      <Box marginTop={1}>
        <Text color="dim">press </Text>
        <Text>ctrl-c</Text>
        <Text color="dim"> to exit. polling every 5s.</Text>
      </Box>
    </Box>
  );
}
