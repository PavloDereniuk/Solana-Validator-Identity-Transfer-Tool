import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useValidatorState } from './useValidatorState.js';
import type { Target } from '../core/ssh.js';

type Props = {
  label: string;
  badgeColor: 'green' | 'magenta' | 'cyan' | 'yellow';
  target: Target;
  ledger: string;
  // when true, stops polling (e.g. while a swap is in flight)
  paused?: boolean;
  // identity we expect to be active (from preflight). drives the "matches expected" hint.
  expectedStaked?: string;
};

function shortPubkey(p?: string): string {
  if (!p) return '—';
  if (p.length <= 12) return p;
  return `${p.slice(0, 6)}…${p.slice(-4)}`;
}

export function ValidatorPanel({ label, badgeColor, target, ledger, paused, expectedStaked }: Props) {
  const s = useValidatorState(target, ledger, paused);
  const idMatches = s.identity && expectedStaked && s.identity === expectedStaked;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={badgeColor} paddingX={1} width={42}>
      <Box>
        <Text bold color={badgeColor}>{label}</Text>
        <Text color="dim"> {target.user}@{target.host}:{target.port}</Text>
      </Box>

      {s.loading && (
        <Box>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text color="dim"> probing…</Text>
        </Box>
      )}

      {s.error && (
        <Box>
          <Text color="red">err </Text>
          <Text color="dim">{s.error}</Text>
        </Box>
      )}

      {!s.loading && !s.error && (
        <Box flexDirection="column">
          <Box>
            <Text color="dim">identity </Text>
            <Text color={idMatches ? 'green' : undefined}>{shortPubkey(s.identity)}</Text>
            {idMatches && <Text color="green"> ✓ staked</Text>}
          </Box>
          <Box>
            <Text color="dim">slot     </Text>
            <Text>{s.slot ?? '—'}</Text>
          </Box>
          <Box>
            <Text color="dim">ledger   </Text>
            <Text>{ledger}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
