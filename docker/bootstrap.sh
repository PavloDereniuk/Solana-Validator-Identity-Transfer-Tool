#!/bin/bash
# bootstrap the mock pair for a swap demo:
#   - generates staked + unstaked identities on validator-a
#   - copies the staked keypair file to validator-b
#   - runs an initial set-identity on a so a tower file exists for the staked key
#
# safe to run repeatedly; --force on solana-keygen new will overwrite.

set -e

KEY="docker/.ssh/id_ed25519"
SSH_OPTS="-i $KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

A_PORT=2201
B_PORT=2202
USER=sol
LEDGER=/home/sol/ledger

ssh_a() { ssh $SSH_OPTS -p $A_PORT $USER@localhost "$@"; }
ssh_b() { ssh $SSH_OPTS -p $B_PORT $USER@localhost "$@"; }

echo "==> generating staked + unstaked identities on validator-a"
ssh_a "solana-keygen new -s --no-bip39-passphrase --force -o /home/sol/staked.json   >/dev/null"
ssh_a "solana-keygen new -s --no-bip39-passphrase --force -o /home/sol/unstaked.json >/dev/null"

echo "==> activating staked identity on validator-a (creates tower file)"
ssh_a "agave-validator -l $LEDGER set-identity /home/sol/staked.json"

echo "==> copying staked keypair file to validator-b"
TMP=$(mktemp)
scp $SSH_OPTS -P $A_PORT $USER@localhost:/home/sol/staked.json "$TMP" >/dev/null
scp $SSH_OPTS -P $B_PORT "$TMP" $USER@localhost:/home/sol/staked.json >/dev/null
rm -f "$TMP"

echo "==> generating unstaked identity on validator-b (for symmetry)"
ssh_b "solana-keygen new -s --no-bip39-passphrase --force -o /home/sol/unstaked.json >/dev/null"

echo
echo "ready. now you can run:"
echo "  node dist/cli.js swap --config docker/swap-config.example.json"
