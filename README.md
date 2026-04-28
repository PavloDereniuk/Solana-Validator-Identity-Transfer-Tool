# Solana Validator Identity Transfer Tool

Transfer staked validator identity between two Solana nodes safely.

WIP. Build: `npm i && npm run build`. Then `vid --help`. Українською:
[README.ua.md](README.ua.md).

If you've never done an identity swap before, read
[docs/safety.md](docs/safety.md) first. It's the only doc here you should
not skip.

## Commands

```
vid init                              # interactive config wizard
vid preflight --config swap-config.json
vid swap      --config swap-config.json [--dry-run] [--tui]
vid status    -H host -k path/to/key
```

`vid init` walks you through both nodes, asks where the keypairs live, and
optionally probes ssh on each side before writing `swap-config.json`.

`vid swap --dry-run` prints the exact shell commands the swap would run, with
real paths and the resolved staked pubkey filled in. No agave-validator state
is touched, so it's safe to do this on a live mainnet box.

`vid swap --tui` runs the whole swap inside an ink dashboard — side-by-side
panels for primary/secondary that poll identity + slot every 5s, a step
progress list, and a live tail of the audit log.

## Local dev

A two-validator mock environment lives in `docker/`. It runs two Ubuntu
containers with `sshd` and bash stand-ins for `agave-validator`, `solana`,
and `solana-keygen` — enough to exercise the swap flow end-to-end without
spinning up real validators.

```
bash docker/setup.sh
```

This builds both images, generates a throwaway ssh keypair under
`docker/.ssh/`, and exposes the two nodes at:

- `validator-a` → `ssh -i docker/.ssh/id_ed25519 -p 2201 sol@localhost`
- `validator-b` → `ssh -i docker/.ssh/id_ed25519 -p 2202 sol@localhost`

Tear down with `docker compose -f docker/docker-compose.yml down -v`.

### Try a swap end-to-end

```
bash docker/bootstrap.sh                                  # generates keypairs + initial tower
node dist/cli.js swap --config docker/swap-config.example.json
```

The swap command runs the standard four-step flow:

1. wait for restart window on the primary
2. set the primary to an unstaked identity
3. transfer the tower file from primary to secondary over sftp
4. set the staked identity on the secondary with `--require-tower`

Tower filenames follow `tower-1_9-{pubkey}.bin`, same as a real validator.

For an interactive view of the same flow, add `--tui`:

```
node dist/cli.js swap --config docker/swap-config.example.json --tui
```

## Tests

```
npm test
```

Covers the pure pieces: preflight scoring, `parseCatchup`, command
builders, and `planSwap`. The SSH and TUI layers are exercised by hand
against the docker mock pair.

## Docs

- [docs/safety.md](docs/safety.md) — slashing-prevention rationale, what
  preflight catches, what `--require-tower` and auto-rollback actually
  guarantee, and what they don't.
- [docs/architecture.md](docs/architecture.md) — code layout and the
  reasoning behind the non-obvious choices (sftp → exec/base64,
  pre-flight runner vs checks, dry-run vs executor).
- [docs/troubleshooting.md](docs/troubleshooting.md) — common operator
  errors and how to recover.
