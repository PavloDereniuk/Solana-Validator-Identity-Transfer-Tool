import React from 'react';
import { Box, Text } from 'ink';

type Props = {
  primary: string;
  secondary: string;
};

export function Header({ primary, secondary }: Props) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyanBright">vid · solana validator identity transfer</Text>
      <Box>
        <Text color="dim">primary   </Text>
        <Text>{primary}</Text>
        <Text color="dim">  →  </Text>
        <Text color="dim">secondary </Text>
        <Text>{secondary}</Text>
      </Box>
    </Box>
  );
}
