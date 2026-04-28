import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import type { SwapConfig } from '../config.js';

export type RunTuiOpts = {
  cfg: SwapConfig;
};

function hostLabel(n: { user: string; host: string; port: number }): string {
  return `${n.user}@${n.host}:${n.port}`;
}

export async function runTui(opts: RunTuiOpts): Promise<void> {
  const { cfg } = opts;
  const inst = render(
    <App
      primaryHost={hostLabel(cfg.primary)}
      secondaryHost={hostLabel(cfg.secondary)}
    />
  );
  await inst.waitUntilExit();
}
