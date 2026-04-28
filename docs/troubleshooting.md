# Troubleshooting

Things that go wrong and what to do about them. Roughly ordered by how
often I've seen them on testnet.

## `wait-for-restart-window` hangs forever

You ran `vid swap` and it sits on step 1. No output, no progress.

Most often the source validator isn't actually running, or it's running
but `agave-validator monitor` returns nothing because the RPC is down.
`wait-for-restart-window` will block until the validator is in a
non-leader, non-pending-fork window — if the validator process is dead,
that window never arrives.

Fix: ssh to the source and run `agave-validator -l <ledger> monitor`
yourself. If that hangs or errors out, fix the source first. Pre-flight
catches this with the `monitor-primary` check; a green pre-flight makes
this very unlikely.

## Pre-flight reports `tower-primary: FAIL`

The check runs `solana address -k <staked>`, builds
`tower-1_9-{pubkey}.bin`, and looks for it in the source ledger. It's
not there.

Three reasons:

1. **The source isn't actually running with the staked identity.** The
   tower file only exists if the staked keypair has been the active
   identity at least once. If the source was started fresh today with a
   different identity, no tower yet.
2. **The ledger path is wrong.** Double-check `primary.ledger` in
   `swap-config.json`. Typo here is silent and common.
3. **Tower filename pattern changed.** `tower-1_9-` is the agave-1.x
   convention. If you're on a Firedancer-only path or a much newer
   release with a different prefix, the code in `src/core/tower.ts`
   needs updating.

There is no useful "force without tower" override. `--require-tower` on
step 4 won't accept the swap anyway.

## Pre-flight reports `identities-distinct: FAIL`

Both keypair paths in your config resolve to the same pubkey. Step 2
(set source to unstaked) would silently no-op and step 3 would copy a
tower for a pubkey that's still the active identity on both nodes.

Generate a new throwaway keypair for the unstaked slot:

```
solana-keygen new --no-passphrase -o ~/.config/solana/unstaked.json
```

Update `identities.unstaked` to point at it. There is no good reason to
ever reuse the staked keypair as the unstaked one.

## `set-identity` fails with "Validator already running with that identity"

You're trying to set the source's identity to the unstaked keypair, but
the source already has the unstaked keypair as its current identity.
`agave-validator` refuses to set-identity to whatever it already has.

Means a previous swap got partway through and left the source in the
unstaked state. Check `agave-validator -l <ledger> contact-info` on the
source — if you see the unstaked pubkey there, the swap from the
previous attempt either succeeded (and the staked identity is on the
other side now, which is actually fine) or the source is just stuck in
the unstaked state.

Either way, don't run swap again until you know which side currently
holds the staked identity. Run `vid status -H ... -k ...` against both
nodes and compare.

## Step 4 fails: `tower file not found`

Step 3 said it transferred N bytes but step 4 is unhappy. Possible
causes:

- Wrong destination ledger path. The transfer wrote to a real directory
  but not the one `agave-validator` reads. Pre-flight's
  `ledger-secondary` check covers existence and writability but not
  "this is the ledger the validator process is using".
- Permissions: the SSH user owns the file but the validator process
  runs as a different user and can't read it. Check
  `ls -l <ledger>/tower-1_9-*.bin` on the destination.
- Filesystem oddity (NFS without close-to-open consistency, etc).
  Rare but real. Run the swap from a host on the same network as the
  destination's filesystem.

## `solana catchup` says "no leader contact"

The destination is up but can't talk to the cluster. Common after a
restart on a fresh ledger or behind a misconfigured firewall. The
catchup watcher will keep polling until `--catchup-timeout` and then
roll back.

Before retrying: on the destination, `solana gossip | head` should show
peers. If it doesn't, fix the network before swapping. The audit log
will have the catchup output verbatim.

## SSH: `Permission denied (publickey)`

The key path in your config doesn't match what's authorized on the
remote. `vid init`'s probe step would have caught this; if you wrote
the config by hand, try the connection manually:

```
ssh -i <key> -p <port> <user>@<host>
```

Make sure the path is absolute (relative paths get resolved against
`vid`'s working directory, which is rarely what you want for keys). The
ssh2 npm library does not pick up `~/.ssh/config` so any host aliases
you use interactively won't work here.

## `vid swap --tui` exits immediately with no output

Your terminal doesn't support the ANSI sequences ink uses. Common with
`screen` and some logging wrappers.

Drop `--tui` and use the plain CLI mode. You lose the side-by-side
panels but the audit log has everything anyway.

## `npm i -g` fails with permission errors

You're hitting the system Node prefix. Two options:

- `sudo npm i -g solana-validator-identity-transfer-tool` — fine on a
  validator host where you already have root.
- Set a user-local prefix once: `npm config set prefix ~/.npm-global`
  and add `~/.npm-global/bin` to PATH. This is the right answer for
  shared boxes.

## Auto-rollback fired and now both sides are confused

The audit log (`audit-YYYY-MM-DD.jsonl`) has the forward swap; the
incident log (`incident-YYYY-MM-DD.jsonl`) has the rollback. Read both,
in that order, with `jq`:

```
jq -c . audit-2026-04-29.jsonl
jq -c . incident-2026-04-29.jsonl
```

The last `swap-complete` event in either file tells you which host has
the staked identity right now. From there you can decide whether to
investigate why the destination didn't catch up, or just leave the
identity on the original primary and move on.

## "It worked on testnet, mainnet refused step 4"

Almost always a version skew between the two nodes that pre-flight only
warned about. `cluster-version` is a `warn` not a `fail` deliberately —
most cross-version swaps work — but the failure mode when it doesn't is
exactly this. Match versions, retry.
