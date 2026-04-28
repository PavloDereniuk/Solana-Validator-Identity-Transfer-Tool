import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { StepState } from './store.js';

type Props = {
  steps: StepState[];
};

function fmtDur(ms?: number): string {
  if (ms === undefined) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusGlyph(s: StepState): React.ReactNode {
  switch (s.status) {
    case 'pending': return <Text color="dim">  ·</Text>;
    case 'running': return <Text color="yellow"><Spinner type="dots" /></Text>;
    case 'done':    return <Text color="green">  ✓</Text>;
    case 'fail':    return <Text color="red">  ✗</Text>;
  }
}

export function SwapProgress({ steps }: Props) {
  if (steps.length === 0) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>swap progress</Text>
      {steps.map((s, i) => (
        <Box key={s.id}>
          <Text color="dim">[{i + 1}/{steps.length}] </Text>
          {statusGlyph(s)}
          <Text>  {s.label}</Text>
          {s.durationMs !== undefined && <Text color="dim">  ({fmtDur(s.durationMs)})</Text>}
        </Box>
      ))}
    </Box>
  );
}
