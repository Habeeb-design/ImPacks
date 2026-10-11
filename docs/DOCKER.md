# Node 24 development on macOS 11

Use the existing Docker Desktop installation. Run commands from the repository root.
The Mac's Node/npm and shell configuration remain unchanged; Node 24 runs in Linux.
The official image is pinned by digest to Node 24.21.0 and npm 11.19.0.

```sh
open -a Docker
docker compose -f compose.node24.yaml up -d
docker compose -f compose.node24.yaml exec dev node -v
docker compose -f compose.node24.yaml exec dev npm -v
```

Install dependencies on first setup, or after dependency changes:

```sh
docker compose -f compose.node24.yaml exec dev npm install --no-save
```

Lifecycle scripts run normally. `--no-save` prevents incidental package manifest and lockfile
rewrites during environment setup; use normal npm dependency commands inside the
container when intentionally changing dependencies and review the lockfile changes.
Separate named volumes cover every workspace's `node_modules` and build directories,
so Linux does not use or overwrite the existing macOS dependencies and build output.
Source files are mounted live: Cursor edits are immediately visible inside Linux.

Start the backend (Ctrl-C stops it):

```sh
docker compose -f compose.node24.yaml exec dev npm run dev:api
```

API: http://localhost:3001/api/health. Container `HOST=0.0.0.0` allows forwarding;
the published host port is restricted to localhost. API configuration continues to
load from `apps/api/.env`, if present. Keep `APP_MODE=demo` for the current starter.

Run checks:

```sh
docker compose -f compose.node24.yaml exec dev npm run typecheck
docker compose -f compose.node24.yaml exec dev npm test
docker compose -f compose.node24.yaml exec dev npm run build
```

Open a Linux terminal in any new Cursor terminal session:

```sh
docker compose -f compose.node24.yaml exec dev bash
```

Inside that shell, normal `node`, `npm`, and repository scripts use Linux Node 24.
Use `exit` to return to macOS. Stop the container without deleting its data:

```sh
docker compose -f compose.node24.yaml stop
```

Restart with `up -d`. Do not remove volumes unless you intend to discard Linux
dependencies/build caches. This setup only publishes the backend port.

Checkout SQLite data lives on the persistent `impacks-node24_checkout_data` volume at
`/var/lib/impacks/checkout.sqlite`. `stop` and container recreation preserve it.
Do not run `down -v` or delete this volume: it contains purchases and consumed
transaction hashes required for replay protection. Tests use separate temporary databases.
