# Architecture

Quick tour of the moving parts and why they look like that.

## Layout

```
src/
  cli.ts               commander entrypoint, all flags live here
  config.ts            swap-config.json loader + Target adapter
  commands/init.ts     interactive wizard (prompts) with optional ssh probe
  core/
    ssh.ts             ssh2 wrapper: exec, readRemote, writeRemote
    validator.ts       cmd* builders + thin exec wrappers around agave-validator
    tower.ts           cmdReadTower / cmdWriteTower + base64-over-exec transfer
    swap.ts            planSwap (pure) + executeSwap
    preflight.ts       runChecks engine + scoring
    checks.ts          the actual checks (13 of them)
    audit.ts           JSONL writer, swap id generator
    rollback.ts        watchCatchup + parseCatchup
  tui/                 ink dashboard for `vid swap --tui`
  util/format.ts       chalk formatters for preflight + dry-run printouts
tests/                 node:test cases for the pure pieces
```

## Why TypeScript/Node

The honest answer is "the operator population that needs this tool already
has Node on the box". Validator hosts run a mix of go-tools, python scripts,
and node CLIs; `npm i -g` is not novel infrastructure. A Rust binary would
be slightly faster but adds a build step nobody asked for.

The dishonest answer would be "TS gives us types around `agave-validator`
flags". That's true but it's not why the choice was made.

Things we lose by not being Rust: a single-binary install, predictable
memory, ability to embed `solana-cli` as a library. None of those matter
for a tool that mostly shells out to other programs.

## ssh2 vs shelling out to system `ssh`

The first prototype used `ssh user@host -- cmd`. It works, but you inherit
whatever ssh-config the operator has (proxyjumps, controlmasters, agent
forwarding) and small differences blow up `--dry-run` deterministically.

`ssh2` from npm gives us one connection per host with explicit key paths,
no ambient state. Tradeoff: we get to be wrong about authentication
ourselves rather than blaming the system ssh.

## The sftp -> exec/base64 detour for tower transfer

The tower file is small (~hundreds of bytes). The first version used
`ssh2`'s sftp createReadStream. On some hosts (specifically: the docker
mock pair on Windows under WSL2) this hung indefinitely on tiny files
without an EOF event. There's a stale issue against ssh2 about it.

The current code does:

```
on source: base64 -w0 < ledger/tower-1_9-pubkey.bin   # over exec channel
on dest:   base64 -d > ledger/tower-1_9-pubkey.bin    # stdin from above
```

This is what most validator-switch tools do (huiskylabs/svs included), so
it's also what operators expect to see in `--dry-run` output. Win-win.

The commit history (`4821636` then `dda216a`) preserves the bug-and-fix
arc on purpose; if a future tower format change forces sftp again, the
original code is one revert away.

## Pre-flight is two layers, deliberately

`preflight.ts` is just a runner: take a list of `Check`s, run them, score
them, recommend go/wait/no-go. It knows nothing about Solana.

`checks.ts` is where every check lives, and each one knows exactly one
thing about Solana (a binary name, a tower filename pattern, a CLI flag).

That split is what makes the runner trivially unit-testable
(`tests/preflight.test.ts`) and lets us add a new check by writing one
function. New ones go in `checks.ts` and get appended to
`buildSwapChecks`.

## Command builders are pure on purpose

`cmdSetIdentity`, `cmdWaitForRestartWindow`, `cmdReadTower`,
`cmdWriteTower` are pure string functions. The `setIdentity`,
`waitForRestartWindow`, etc. wrappers each call their corresponding
`cmd*` and pipe through `exec`.

This split exists for `--dry-run`: `planSwap` returns the same command
strings the executor would run, with the resolved staked pubkey
substituted in. If you ever look at a dry-run's output and wonder
"is that what swap would actually run?" — the answer is yes, identical
string, same builder.

## Audit log is JSONL on purpose

One event per line, append-only, no transactions, no ordering subtleties.
`tail -F audit-2026-04-29.jsonl | jq` works. fs.watch + 1.5s poll
fallback on the TUI side picks up new lines without holding the file
open.

`stdoutSha`/`stderrSha` exist as fields but aren't always populated —
filled in for steps where stdout is meaningful and small. Filling them
for the tower transfer would be silly (it's a base64 stream).

Failures during a swap append a `swap-error` event. Auto-rollback writes
to a sibling file `incident-YYYY-MM-DD.jsonl` so a postmortem can read
both halves of the story.

## TUI is a thin layer over the same API

`tui/swapWithTui.ts` calls `executeSwap` and `watchCatchup` exactly the
same way `cli.ts` does. The difference is that step callbacks update an
ink store instead of `console.log`-ing.

This means the TUI doesn't get separate test coverage and doesn't need
it: the logic under it is what's tested.

## Where to extend

- **A new pre-flight check.** Write a `Check` in `checks.ts`, append it
  in `buildSwapChecks`. Add a unit test in `tests/preflight.test.ts`
  with the runner if it has interesting weight/score implications.
- **A new validator client (Firedancer/Jito flag differences).** The
  cleanest seam is `cmd*` builders in `validator.ts`. Today they assume
  `agave-validator`; if Firedancer needs a different binary or flag,
  branch there. The tower path will likely also need a separate
  filename pattern in `tower.ts`.
- **A new transport for tower file copy.** `transferTower` in
  `tower.ts` is one function; replace the body and keep the signature.
  The dry-run printer keys off `stdinFrom` so update that too if the
  shape changes.
- **A new output sink for the audit log.** `Auditor` in `audit.ts` is
  small enough to subclass or wrap. The TUI tail reads the JSONL file
  directly, so any sink should still produce a JSONL file.

## What's not here yet

- A real config schema (currently `loadConfig` does shape checks by
  hand). `zod` was in the plan and got dropped for time; adding it
  would be a single-file change.
- Telegram alerts on rollback (UA-bounty surface but not core).
- Firedancer-specific tower handling. Pre-flight will warn on a version
  mismatch but the actual filename/flag differences haven't been
  exercised.
