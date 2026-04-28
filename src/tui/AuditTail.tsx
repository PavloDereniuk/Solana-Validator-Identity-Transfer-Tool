import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { readFile } from 'node:fs/promises';
import { watch } from 'node:fs';

type AuditLine = {
  ts: string;
  step: string;
  host?: string;
  message?: string;
  durationMs?: number;
  exit?: number;
  error?: string;
};

type Props = {
  path: string;
  // how many tail entries to render
  tail?: number;
};

async function readTail(path: string, n: number): Promise<AuditLine[]> {
  let buf: string;
  try {
    buf = await readFile(path, 'utf8');
  } catch {
    return [];
  }
  const lines = buf.split('\n').filter(Boolean);
  return lines.slice(-n).map((ln) => {
    try { return JSON.parse(ln) as AuditLine; }
    catch { return { ts: '', step: ln.slice(0, 60) }; }
  });
}

export function AuditTail({ path, tail = 8 }: Props) {
  const [lines, setLines] = useState<AuditLine[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const next = await readTail(path, tail);
      if (!cancelled) setLines(next);
    };

    refresh();
    // fs.watch on jsonl files works fine — fire on every append
    let watcher: ReturnType<typeof watch> | undefined;
    try {
      watcher = watch(path, { persistent: false }, () => { refresh(); });
    } catch {
      // file may not exist yet — fall back to polling
    }
    const poll = setInterval(refresh, 1500);

    return () => {
      cancelled = true;
      clearInterval(poll);
      if (watcher) watcher.close();
    };
  }, [path, tail]);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>audit tail</Text>
      <Text color="dim">{path}</Text>
      {lines.length === 0 && <Text color="dim">  (no events yet)</Text>}
      {lines.map((ln, i) => {
        const t = ln.ts ? ln.ts.slice(11, 19) : '--:--:--';
        const tail = ln.error
          ? <Text color="red"> err {ln.error}</Text>
          : ln.message
            ? <Text color="dim"> {ln.message}</Text>
            : null;
        const dur = ln.durationMs !== undefined ? <Text color="dim"> ({ln.durationMs}ms)</Text> : null;
        return (
          <Box key={i}>
            <Text color="dim">{t} </Text>
            <Text>{ln.step}</Text>
            {dur}
            {tail}
          </Box>
        );
      })}
    </Box>
  );
}
