# Engine host

The box runs one compiled binary from the GitHub release `solos-engine@<version>`:
`solos-engine-linux-x64` or `solos-engine-linux-arm64`, plus `SHA256SUMS`. Download the
binary you will run and `SHA256SUMS` into one directory and verify before installing:

```sh
sha256sum --check --ignore-missing SHA256SUMS
```

The binary embeds Bun. Dotenv autoload is off, so a `.env` next to the binary is not read.
Configuration comes from the environment file and the flags on the command line.
`/v1/health` reports the version baked in from the release tag.

## Service user

A dedicated user owns the binary and the keypair. It does not own the environment file.
The keypair file is owned by that user, mode 0600.

```sh
sudo useradd --system --create-home --home-dir /var/lib/solos-engine --shell /usr/sbin/nologin solos-engine
sudo install -o solos-engine -g solos-engine -m 0755 solos-engine-linux-x64 /usr/local/bin/solos-engine
sudo install -d -o solos-engine -g solos-engine -m 0750 /var/lib/solos-engine
sudo install -o solos-engine -g solos-engine -m 0600 keypair.json /var/lib/solos-engine/keypair.json
```

## Environment file

Dotenv autoload is off, so secrets come from the unit, not from a file beside the binary.
`EnvironmentFile=/etc/solos-engine/engine.env` is owned root:root, mode 0600. systemd reads
it as root and passes the variables in. The service user never opens that file. It carries
`SOLOS_ENGINE_TOKEN` and `SOLOS_SIGNER_KEYPAIR_PATH` (the keypair path above), plus
`SOLANA_RPC_URL` and `SOLOS_LOG_LEVEL`.

`SOLOS_ENGINE_TOKEN` never goes in `ExecStart`. Any local user can read a process command
line. `LoadCredential=` is an alternative for the token: the engine still reads
`SOLOS_ENGINE_TOKEN` from the environment, so the unit exports the credential and then
`exec`s the binary. The value stays off the command line either way.

```sh
sudo install -d -o root -g root -m 0755 /etc/solos-engine
sudo install -o root -g root -m 0600 /dev/null /etc/solos-engine/engine.env
```

## systemd

Logs are JSON on stderr and reach journald unchanged. `Restart=always` brings the process
back. The engine binds `127.0.0.1`. Remote callers reach that port through an SSH tunnel:

```sh
ssh -N -L 8787:127.0.0.1:<port> engine-host
```

or through a TLS reverse proxy on the host. Binding `--host` to the private interface IP
is possible, but that path is unencrypted.

`--tier execute` belongs on the live box only. Any other box omits it and stays a dry run
(`mode: "dry"` in /v1/health) at the simulate ceiling. Live start passes `--allowed-mints`
as one comma-separated list. The example is wrapped SOL and USDC.

```ini
[Unit]
Description=solOS engine
After=network-online.target
Wants=network-online.target

[Service]
User=solos-engine
Group=solos-engine
EnvironmentFile=/etc/solos-engine/engine.env
ExecStart=/usr/local/bin/solos-engine --host 127.0.0.1 --port 8787 --tier execute --allowed-mints So11111111111111111111111111111111111111112,EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --data-dir /var/lib/solos-engine
Restart=always
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

`--allowed-mints any` allows every mint. That is a deliberate opt-in (ADR-0038).

## Not covered

The engine does not terminate TLS, this setup is not a public endpoint, and backups of the
data directory are not part of it.
