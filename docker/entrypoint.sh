#!/bin/bash
set -e

# generate sshd host keys on first boot
ssh-keygen -A

if [ -f /authorized_keys ]; then
    install -m 600 -o sol -g sol /authorized_keys /home/sol/.ssh/authorized_keys
fi

# disable root login, require key auth
sed -i 's/#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config

exec /usr/sbin/sshd -D -e
