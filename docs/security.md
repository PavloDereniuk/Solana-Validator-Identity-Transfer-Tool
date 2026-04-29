# Security model

How `vid` handles your keys, what it writes to disk, and what it doesn't.
For the consensus-safety side of the swap (slashing, `--require-tower`,
auto-rollback) see [safety.md](safety.md). This page is about secrets.

## Validator identity keypairs

The staked and unstaked validator keypairs are **never** read into the
local Node process running `vid`. They live only on the validator hosts
themselves. The only operations `vid` performs against them are:

- `solana address -k <path>` over SSH, to derive a pubkey. Returns the
  pubkey, not the keypair.
- `agave-validator … set-identity <path>` over SSH, executed remotely.
  The validator process reads the file from its own disk; `vid` only
  sends the path string.

There is no code path in this tool that opens a keypair file locally.
`grep readFile src/core/` will surface the only file we open: the SSH
private key (see below).

## SSH private key

`vid` reads your SSH private key via `node:fs` to authenticate `ssh2`
against the remote hosts (`src/core/ssh.ts`, function `connect`). The
key buffer stays in memory for the duration of the connection and is
never written anywhere.

The key path comes from `swap-config.json`. We do not pick up
`~/.ssh/config` host aliases — explicit paths only.

## What ends up in the audit log

The audit log (`audit-YYYY-MM-DD.jsonl`) and incident log
(`incident-YYYY-MM-DD.jsonl`) are append-only JSONL written with mode
`0600` (operator-only). Each event contains:

- timestamp, swap id, step name
- host (`user@host:port` form, no key path)
- duration, exit code
- optional `stdoutSha`/`stderrSha` — sha256 of the command's output, when
  it's small and meaningful
- optional `message` — human-friendly summary (e.g. `"4096 bytes"` for
  the tower transfer, `"converged=true lastSlots=0"` for catchup)
- on errors: `error` — the message of the thrown exception

What does **not** end up in the audit log:

- keypair file contents (we never read them)
- SSH private key contents (we read but never log)
- the staked or unstaked keypair file paths, except where they appear
  inside an exception message bubbled up from `agave-validator` itself

If your environment treats key paths as sensitive, vendor the audit log
the same way you vendor SSH config: chmod 600, owner-only, and don't
ship it off-host.

## Config file

`vid init` writes `swap-config.json` with mode `0600`. The file
contains:

- host/port/user for both validators
- the path to the SSH private key
- the path to the staked and unstaked validator keypairs
- the ledger directory

None of these are secrets in themselves but together they describe how
to swap the staked identity, so treat the file accordingly.

## Threat model

What we explicitly defend against:

- **Bystander on the same machine reading the audit log.** Mode 0600
  on both audit and incident log; mode 0600 on the config.
- **Operator typo causing the unstaked keypair to be the same as the
  staked one.** Pre-flight `identities-distinct` check.
- **Stale or missing tower file leading to a double-vote.**
  Pre-flight `tower-primary` check (now also verifies non-empty),
  plus `--require-tower` on the destination as the last gate.
- **Slow or hung `wait-for-restart-window` blocking the swap
  indefinitely.** `--wait-timeout` on `vid swap` (default 600s) cuts
  the swap before it leaves the source in an unstaked state.

What we do **not** defend against, and where you carry the risk:

- **A compromised SSH private key.** If the key is stolen, the attacker
  can do everything `vid` can. Use a key dedicated to validator
  operations and rotate it on the same cadence as the rest of your
  ops keys.
- **A compromised validator host.** If root on the source is owned,
  the attacker has the staked keypair regardless of `vid`. We do not
  attempt to seal the keys against a host-level adversary.
- **A man-in-the-middle on SSH.** SSH itself protects this if you've
  pinned host keys (`known_hosts`). `ssh2` will refuse a host that
  changes fingerprints without explicit override.
- **Side-channel via stderr.** If a future `agave-validator` release
  starts printing keypair material to stderr (it doesn't today), that
  stderr would land in the exception message of a failed swap and
  potentially in the audit log under `error`. There's no general
  mitigation for this short of reviewing every release. We treat it
  as a vendor-trust assumption.

## What to do on a fresh validator host

1. Generate a dedicated SSH key for `vid`, not your daily-driver key.
   `ssh-keygen -t ed25519 -f ~/.ssh/vid_ed25519`.
2. `chmod 600` the staked and unstaked keypair files. `agave-validator`
   refuses to load looser permissions, so you'll find out fast if you
   missed this.
3. Disable password auth and root login in `/etc/ssh/sshd_config` on
   both validator hosts. Identity transfer assumes a hardened SSH
   surface.
4. Run `vid init` and confirm the resulting `swap-config.json` is
   `0600` (`ls -l swap-config.json`). It should be — file an issue if
   it isn't.
5. Run a swap on testnet first. The audit log from that run is the
   template you'll be reading on mainnet, so know what "normal" looks
   like.

## Reporting a security issue

If you find something here that looks worse than what's documented,
open a private issue or message the contact on the GitHub repo. Don't
post details in a public issue if it would help someone slash a live
validator.
