import React from 'react';
import { render, type Instance } from 'ink';
import { App } from './App.js';
import { TuiStore } from './store.js';
import type { SwapConfig } from '../config.js';

export type TuiHandle = {
  store: TuiStore;
  instance: Instance;
  waitForExit: () => Promise<void>;
};

export type StartTuiOpts = {
  cfg: SwapConfig;
  expectedStaked?: string;
  auditPath?: string;
};

export function startTui(opts: StartTuiOpts): TuiHandle {
  const store = new TuiStore();
  const instance = render(
    <App
      cfg={opts.cfg}
      expectedStaked={opts.expectedStaked}
      store={store}
      auditPath={opts.auditPath}
    />,
    { exitOnCtrlC: true }
  );
  return {
    store,
    instance,
    waitForExit: () => instance.waitUntilExit(),
  };
}
