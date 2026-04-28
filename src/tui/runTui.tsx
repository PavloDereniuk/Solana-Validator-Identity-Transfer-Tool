import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import type { SwapConfig } from '../config.js';

export type RunTuiOpts = {
  cfg: SwapConfig;
  expectedStaked?: string;
};

export async function runTui(opts: RunTuiOpts): Promise<void> {
  const { cfg, expectedStaked } = opts;
  const inst = render(
    <App cfg={cfg} expectedStaked={expectedStaked} />
  );
  await inst.waitUntilExit();
}
