#!/bin/bash
# brings up the local two-validator dev pair
# generates a throwaway ssh keypair on first run

set -e
cd "$(dirname "$0")"

if [ ! -f .ssh/id_ed25519 ]; then
    mkdir -p .ssh
    ssh-keygen -t ed25519 -f .ssh/id_ed25519 -N "" -C "vid-dev" -q
    cp .ssh/id_ed25519.pub authorized_keys
    echo "generated dev ssh keypair in docker/.ssh/"
fi

docker compose up -d --build

cat <<EOF

ready.

  validator-a:  ssh -i docker/.ssh/id_ed25519 -p 2201 sol@localhost
  validator-b:  ssh -i docker/.ssh/id_ed25519 -p 2202 sol@localhost

EOF
