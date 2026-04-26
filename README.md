# Solana Validator Identity Transfer Tool

Transfer staked validator identity between two Solana nodes safely.

WIP. Build: `npm i && npm run build`. Then `vid --help`.

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
