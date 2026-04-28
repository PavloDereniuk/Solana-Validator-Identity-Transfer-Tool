# Safety

Identity transfer is the most dangerous routine maintenance task a Solana
validator operator does. If two machines vote with the same identity at the
same time the protocol slashes you. There is no undo. This page exists so
that you understand exactly what `vid` does to keep that from happening, and
where its guarantees end.

## What can actually go wrong

A staked identity is just a keypair. Whichever machine has the keypair active
plus a fresh tower can vote. The two pathological states are:

1. **Both nodes vote.** The keypair is loaded into two running validators and
   each casts a vote on the same slot. Slashable.
2. **Neither node votes.** The keypair is unloaded everywhere and the
   validator misses an epoch of credits. Not slashable, but real money.

The flow we implement is the canonical one used by Solana core developers
(see mvines' identity-transition demo and the Pumpkin's Pool runbook). It
trades a few seconds of (2) to make (1) impossible.

## The four steps

Every swap is exactly these four operations, in order:

1. **`wait-for-restart-window` on the source.** Blocks until the source is
   not the slot leader and there is no pending fork choice. This is what
   makes the rest of the operation safe to do without taking the validator
   down. We pass `--min-idle-time 2 --skip-new-snapshot-check` so we get a
   short, deterministic window.
2. **`set-identity` to an unstaked junk keypair on the source.** The source
   is now a validator with an identity nobody has staked to. It cannot vote.
   At this exact moment the staked pubkey is voting nowhere on the network —
   this is the unavoidable gap.
3. **Copy `tower-1_9-{pubkey}.bin` from the source ledger to the
   destination.** The tower file records the highest slot the staked
   identity has voted on so far. Copying it forward is what lets the
   destination start voting again without re-voting any slot.
4. **`set-identity --require-tower {staked-keypair}` on the destination.**
   The `--require-tower` flag tells `agave-validator` to refuse the swap
   unless it finds a tower file for this pubkey already on disk. That
   single flag is what prevents step 4 from completing on a node that
   doesn't have step 3's output. It's the final gate against a double-vote.

If any step before step 4 fails, the staked identity is not voting anywhere
and you're in case (2): expensive but not slashable. You can investigate and
either retry, or swap the identity back onto the source.

## Pre-flight: catching unsafe states before step 1

Pre-flight is a set of cheap, idempotent SSH probes that run before the
first irreversible command. The goal is to refuse to start a swap that has
no realistic chance of completing.

The shipped checks are:

- `ssh-{primary,secondary}` — both hosts respond to a trivial command.
  Without this every later check is a lie.
- `binaries-{primary,secondary}` — `agave-validator` and `solana` are on
  PATH. We've seen swaps fail at step 4 because the destination only had
  `solana` and not the validator binary.
- `ledger-{primary,secondary}` — ledger directory exists and is writable
  by the SSH user. A read-only ledger on the destination silently breaks
  tower transfer.
- `staked-keypair-{primary,secondary}` — the staked keypair is present on
  *both* sides. Step 4 needs it on the destination.
- `unstaked-keypair-primary` — the throwaway keypair we set on the source
  in step 2 must exist on the source.
- `identities-distinct` — the staked and unstaked keypairs do not resolve
  to the same pubkey. This is the most common typo in operator runbooks
  and the easiest way to accidentally vote with two nodes.
- `tower-primary` — the file `tower-1_9-{staked-pubkey}.bin` exists in the
  source's ledger directory. Without it step 3 has nothing to copy and
  step 4 will be refused by `--require-tower`.
- `monitor-primary` — `agave-validator monitor` returns a slot. If the
  source isn't actually running, `wait-for-restart-window` will hang
  forever in step 1.
- `cluster-version` — both sides report the same `agave-validator
  --version`. A version mismatch is a warning, not a failure: it works
  most of the time, but tower file format has shifted between major
  releases and we'd rather you notice now than at step 4.

Each check has a weight. Passes count fully, warnings count for half,
failures count for zero. The score is rounded to a percentage. **A single
failing check forces the recommendation to `no-go` regardless of score.**
You can override with `--skip-preflight` but that's a bad idea on
mainnet, ever.

## `--require-tower` is the actual safety belt

Pre-flight catches misconfiguration. `--require-tower` catches everything
pre-flight missed: a tower file that got deleted between pre-flight and
step 3, a typo in the destination ledger path, a clock skew that made the
file look stale to the destination. If step 3 silently put the file in the
wrong place, step 4 refuses. The validator process exits, no vote is cast,
and you are in case (2), not case (1).

If you ever see yourself adding a flag that bypasses `--require-tower`,
stop and ask why.

## Auto-rollback: catchup watcher on the destination

After step 4 succeeds on the destination, `vid swap` polls
`solana catchup --our-localhost` on the destination. If it does not
converge within `--catchup-timeout` (default 90s) to within
`--catchup-threshold` slots (default 50), `vid` runs the same four-step
flow in reverse: source becomes the destination, destination becomes the
source. The original primary now holds the staked identity again. Both
runs are written to a JSONL incident log next to the audit log.

What this protects against:

- The new node has stale state and is genuinely behind by hundreds of
  slots. We notice and put the identity back on a node that was caught up.
- The destination has a network partition we didn't catch in pre-flight.

What this does **not** protect against:

- The original source got rebooted between step 1 and the rollback. The
  rollback will fail at its own step 1. You'll need to recover by hand.
- The destination is voting fine but the operator's monitoring says
  otherwise. Rollback is an automated belt-and-braces, not a substitute
  for paying attention.

You can disable rollback with `--no-rollback` if you have an external
catchup-monitoring stack you trust more.

## What we deliberately do not do

- **We don't paper over `--require-tower`.** No flag to disable it.
  No fallback path that retries without it.
- **We don't run on mainnet by default.** There is no `--mainnet` flag
  that does anything special. We expect you to test on testnet first
  with a non-staked identity, then run for real once you've watched the
  audit log of a few dry-runs.
- **We don't manage your keypairs.** They're files on the operator's
  disks, owned and chmodded by the operator. `vid` reads paths; it does
  not generate, copy, or rotate keys.
- **We don't run unattended.** Every command emits to the audit log;
  every failure exits non-zero. Wire it into whatever runbook tooling
  you trust, but don't let `vid swap` fire from cron without a human
  watching the first few times.

## First-run checklist

Before you point this at a mainnet node:

1. Run `vid preflight --config <path>` until it scores 100. If anything
   warns or fails, fix it. Don't skip.
2. Run `vid swap --dry-run --config <path>`. Read every line. Those are
   the exact commands that will run.
3. Spin up the docker mock pair (see README) and run `vid swap` against
   it end-to-end at least once.
4. Test on testnet with a non-staked identity at least once.
5. Only then on mainnet, and even then have a second operator on the
   call.

If any of those four feel like overkill, that is the wrong feeling. The
penalty for a slash is permanent loss of stake; the penalty for spending
half an hour on a checklist is half an hour.
