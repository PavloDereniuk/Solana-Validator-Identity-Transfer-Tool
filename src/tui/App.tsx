import React from 'react';
import { Box, Text } from 'ink';
import { Header } from './Header.js';

export type AppProps = {
  primaryHost: string;
  secondaryHost: string;
};

export function App({ primaryHost, secondaryHost }: AppProps) {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Header primary={primaryHost} secondary={secondaryHost} />
      <Box flexDirection="column">
        <Text color="dim">tui scaffold ready. panels coming next.</Text>
      </Box>
    </Box>
  );
}
