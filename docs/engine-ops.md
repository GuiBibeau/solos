# Engine host

The box runs one compiled binary from the GitHub release `solos-engine@<version>`:
`solos-engine-linux-x64` or `solos-engine-linux-arm64`, plus `SHA256SUMS`. Download both
files into one directory and verify before installing:

```sh
sha256sum --check SHA256SUMS
```

The binary embeds Bun. Nothing else is installed beside it, and a `.env` next to the binary
is not read. Configuration comes from the environment file and the flags on the command line.
`/v1/health` reports the version baked in from the release tag.

## Service user

A dedicated user owns the binary and the keypair. It does not own the environment file.

```sh
sudo useradd --system --create-home --home-dir /var/lib/solos-engine --shell /usr/sbin/nologin solos-engine
sudo install -o solos-engine -g solos-engine -m 0755 solos-engine-linux-x64 /usr/local/bin/solos-engine
sudo install -d -o solos-engine -g solos-engine -m 0750 /var/lib/solos-engine
sudo install -o solos-engine -g solos-engine -m 0600 keypair.json /var/lib/solos-engine/keypair.json
```

The keypair file is mode 600. The binary is executable and owned by that user.

## Environment file

`/etc/solos-engine.env` is owned by root, mode 600. systemd reads `EnvironmentFile=` as root
and passes the variables to the process, so the service user never needs to open the file.
The file carries:

- `SOLANA_RPC_URL`
- `SOLOS_SIGNER_KEYPAIR_PATH` — the keypair path above
- `SOLOS_ENGINE_TOKEN`
- `SOLOS_LOG_LEVEL`

```sh
sudo install -o root -g root -m 0600 /dev/null /etc/solos-engine.env
```

## systemd

Logs are JSON on stderr and reach journald unchanged. `Restart=always` brings the process
back. `--host` stays on loopback. Callers reach that port over the private network; the
process does not listen on a public address. `--tier execute` belongs on the live box only.
Any other box omits it and stays at the simulate ceiling. Live start also needs
`--allowed-mints` (mint addresses, or `any`).

```ini
[Unit]
Description=solOS engine
After=network-online.target
Wants=network-online.target

[Service]
User=solos-engine
Group=solos-engine
EnvironmentFile=/etc/solos-engine.env
ExecStart=/usr/local/bin/solos-engine --host 127.0.0.1 --port 8787 --tier execute --allowed-mints any --data-dir /var/lib/solos-engine
Restart=always
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Replace `--allowed-mints any` with the mint addresses the box may spend when the live box
should not accept every mint.

## Not covered

TLS, a public endpoint, and backups of the data directory are not part of this setup.
