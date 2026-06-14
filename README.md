# server-dash

A self-hosted system dashboard for NixOS. Displays live system stats, controls Tapo smart plugs, manages JMIoT ESP32 smart buttons and automations, and provides systemd service management — all behind WebAuthn + TOTP authentication.

## Architecture

| Package | Stack | Port |
|---|---|---|
| `packages/frontend` | Next.js 16 (standalone) | 3000 |
| `packages/api` | Rust / Axum | 3001 |

The frontend proxies most requests to the API. Both services are deployed separately and managed by systemd via NixOS modules defined in `flake.nix`.

---

## Configuration

Both services read from a single config file at `/etc/server-dash/config.toml`.

**The file is created automatically on the first API start** with `useDefaultConfig = true` and all settings commented out. Edit it and set `useDefaultConfig = false` to activate your configuration.

```bash
sudo nano /etc/server-dash/config.toml
sudo systemctl restart server-dash-api server-dash
```

### Full config reference

```toml
# Set to false once you have filled in your settings below.
# While true, all settings are ignored and defaults are used.
useDefaultConfig = true

[features]
# Set to false to disable all Tapo smart-plug features:
# device discovery, live polling, power on/off routes, and history.
tapo = true

# Set to true to open the /enroll registration flow for new users.
# Keep false after initial setup.
enrollment_open = false

[tapo]
# Tapo account credentials (email/password from the Tapo mobile app).
username = ""
password = ""

# Subnet to scan for Tapo devices (e.g. "192.168.1").
# Auto-detected from the local network interface if not set.
# subnet = "192.168.1"

[server]
# Address the frontend Next.js server binds to.
# Defaults to "0.0.0.0" (all interfaces) if not set.
# frontend_host = "0.0.0.0"

# LAN IP of this server — registered as the callback URL with ESP32 smart buttons.
# Auto-detected via UDP if not set.
# dellserv_ip = "192.168.1.100"
```

### How each setting is used

| Key | Default | Effect |
|---|---|---|
| `useDefaultConfig` | `true` | When `true`, all other settings are ignored |
| `features.tapo` | `true` | `false` removes all `/power` routes and stops background polling |
| `features.enrollment_open` | `false` | `true` enables `/enroll` and the `/api/auth/register/*` routes |
| `tapo.username` | `""` | Tapo account email |
| `tapo.password` | `""` | Tapo account password |
| `tapo.subnet` | auto | Subnet scanned for devices on port 80 |
| `server.frontend_host` | `0.0.0.0` | Bind address for the Next.js server |
| `server.dellserv_ip` | auto | Server LAN IP sent to ESP32 devices as callback URL |

---

## NixOS Setup

The repo exposes two NixOS modules via its flake: `nixosModules.frontend` and `nixosModules.api`.

### 1. Add the flake input

```nix
# flake.nix
inputs = {
  server-dash-mono.url = "github:JackMechem/server-dash";
};
```

### 2. Import the modules

```nix
# In your host's nixosSystem modules list:
inputs.server-dash-mono.nixosModules.frontend
inputs.server-dash-mono.nixosModules.api
```

### 3. Enable the services

```nix
services.server-dash = {
  enable = true;
  package = "/var/lib/server-dash/build";  # path to the deployed Next.js standalone build
};

services.server-dash-api = {
  enable = true;
  useNixBuild = false;  # true = build binary via Nix; false = use manually deployed binary
};
```

### What the modules provision automatically

**Frontend module** (`nixosModules.frontend`):
- `server-dash` system user and group
- Home directory at `/var/lib/server-dash`
- `server-dash.service` systemd unit (Node.js, port 3000)
- Reads `frontend_host` from `/etc/server-dash/config.toml` at start

**API module** (`nixosModules.api`):
- `server-dash-api` system user and group (with `shadow` group access)
- Home directory at `/var/lib/server-dash-api`
- `server-dash-api.service` systemd unit (Rust binary, port 3001)
- `/etc/server-dash/` directory (owned by `server-dash-api`, world-readable)
- `/var/lib/server-dash-api/` directory and subdirectories via `systemd.tmpfiles`
- PAM service for system user authentication
- Polkit rules for systemd service management and system power actions

### Updating

After pushing changes to the repo, update the flake lock in your NixOS config and rebuild:

```bash
cd ~/nixos
nix flake update server-dash-mono
sudo nixos-rebuild switch --flake .#
```

---

## Deployment

### First-time setup

**1. NixOS rebuild** (provisions users, directories, and services):
```bash
sudo nixos-rebuild switch --flake .#
```

**2. Create the initial app user:**
```bash
sudo -u server-dash-api /var/lib/server-dash-api/server-dash-api --create-user <username> <password>
```

**3. Configure the app** — the API creates the config file on first start:
```bash
sudo nano /etc/server-dash/config.toml
# Set useDefaultConfig = false and fill in your settings
sudo systemctl restart server-dash-api
```

**4. Enable enrollment and register your WebAuthn key:**
```
# In /etc/server-dash/config.toml:
[features]
enrollment_open = true
```
Then restart both services, navigate to `/enroll`, register, and set `enrollment_open = false` again.

---

### Deploying the frontend (Next.js)

Run from `packages/frontend`:

```bash
pnpm deploy
```

This builds the Next.js standalone output and copies it to `/var/lib/server-dash/build/`, then restarts `server-dash.service`.

---

### Deploying the API (Rust)

```bash
cd packages/api
cargo build --release
sudo cp target/release/server-dash-api /var/lib/server-dash-api/server-dash-api
sudo chown server-dash-api:server-dash-api /var/lib/server-dash-api/server-dash-api
sudo systemctl restart server-dash-api
```

Alternatively, set `useNixBuild = true` in your NixOS config to have Nix build and manage the binary.

---

## Development

The repo uses Nix flake dev shells.

### Run both services together

```bash
nix develop
dev
```

Or without Nix:
```bash
make dev
```

### Frontend only

```bash
nix develop .#frontend
pnpm dev
```

### API only

```bash
nix develop .#api
cargo run
```

The dev shells provide all required dependencies (Node.js, pnpm, Rust toolchain, OpenSSL, libpam, libclang).

For development, create `/etc/server-dash/config.toml` with your settings (or run as a user that can write to `/etc/server-dash/` — the API will create a default config on first run).

---

## Data directories

| Path | Contents |
|---|---|
| `/etc/server-dash/config.toml` | Runtime configuration (all services) |
| `/var/lib/server-dash-api/` | API persistent data |
| `/var/lib/server-dash-api/settings.json` | WebAuthn RP ID / origin overrides |
| `/var/lib/server-dash-api/credentials/` | App user credentials |
| `/var/lib/server-dash-api/webauthn-credentials/` | Registered WebAuthn keys |
| `/var/lib/server-dash-api/totp/` | TOTP secrets |
| `/var/lib/server-dash-api/smart-buttons.json` | ESP32 smart button registry |
| `/var/lib/server-dash-api/automations.json` | Automation rules |
| `/var/lib/server-dash-api/power-history.json` | Tapo power history (60 days) |
| `/var/lib/server-dash/build/` | Deployed Next.js standalone build |
