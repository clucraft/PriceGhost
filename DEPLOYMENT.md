# Deployment (Strato VPS + GHCR)

The app is deployed to a Strato VPS at **https://geist.online**. GitHub Actions builds and tests the
images, pushes them to the **private** GitHub Container Registry (GHCR), and then SSHes into the VPS
to pull and run them with Docker Compose. Postgres runs 24/7 on the VPS with a persistent volume and
automatic rotating backups.

```
merge to main
   └─▶ GitHub Actions: test → build geist-backend/geist-frontend → push to GHCR
          └─▶ SSH to VPS → scripts/deploy.sh → docker compose pull && up -d
                 └─▶ caddy (443) → frontend → backend → postgres (persistent volume)
```

## Pipeline overview

- **test** — `npm ci && npm run build` for backend and frontend (typecheck/compile gate).
- **build-backend / build-frontend** — build images and push to
  `ghcr.io/geist-app/geist-backend` and `ghcr.io/geist-app/geist-frontend`, tagged with the short
  commit SHA and `latest`. On PRs images are built but **not** pushed.
- **deploy** — runs only on push/merge to `main`; SSHes to the VPS and runs `scripts/deploy.sh`
  with `IMAGE_TAG=<short-sha>`.

The running commit is exposed at `https://geist.online/api/info` → `{"version":"<short-sha>"}`.

## Config: two separate places

**Do not confuse these.**

### GitHub repo Secrets (Settings → Secrets and variables → Actions)
Only used so the pipeline can reach and log into the VPS:

| Secret | Purpose |
|---|---|
| `VPS_HOST` | VPS IP or hostname |
| `VPS_USER` | SSH user on the VPS |
| `VPS_SSH_KEY` | Private SSH key whose public key is in the VPS `~/.ssh/authorized_keys` |
| `VPS_SSH_PORT` | *(optional)* SSH port if not 22 |

GHCR push needs **no** secret — the built-in `GITHUB_TOKEN` (`packages: write`) handles it.

### VPS `.env` (at `/opt/geist/.env`, gitignored)
Configures the running stack. Copy from `.env.example` and set strong secrets: `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `JWT_SECRET`, `IMAGE_TAG`.
Generate secrets with e.g. `openssl rand -hex 32`.

## One-time VPS bootstrap

**Quick path:** after cloning the repo (step 2 below), run the guided setup script — it walks
through Docker install, GHCR login, `.env` creation (auto-generating secrets), the DNS/firewall
check, the first `docker compose up`, and the backup cron:

```bash
cd /opt/geist && bash scripts/setup.sh
```

The manual steps below do the same thing if you prefer to run them yourself.

1. **Install Docker** (Engine + compose plugin):
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

2. **Clone the repo** to `/opt/geist`:
   ```bash
   sudo git clone https://github.com/<owner>/<repo>.git /opt/geist
   sudo chown -R "$USER" /opt/geist
   cd /opt/geist
   ```

3. **Log in to GHCR** so the VPS can pull the private images. Create a GitHub Personal Access
   Token with the `read:packages` scope, then:
   ```bash
   echo "<PAT>" | docker login ghcr.io -u <github-username> --password-stdin
   ```
   In GitHub, set both `geist-backend` and `geist-frontend` packages to **Private** (Package
   settings → Change visibility) and link them to the repo.

4. **Create `.env`**:
   ```bash
   cp .env.example .env
   # edit .env: set strong POSTGRES_PASSWORD / JWT_SECRET (keep DATABASE_URL in sync)
   ```

5. **DNS + firewall**: point `geist.online` (and `www`) A/AAAA records at the VPS IP, and open
   ports **80** and **443** in the Strato firewall (Caddy needs 80 for the ACME challenge).

6. **Start the stack**:
   ```bash
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d
   docker compose -f docker-compose.prod.yml ps
   ```

7. **Install the backup cron** (daily at 03:00):
   ```bash
   ( crontab -l 2>/dev/null; echo "0 3 * * * cd /opt/geist && bash scripts/backup.sh >> /opt/geist/backups/backup.log 2>&1" ) | crontab -
   ```

8. **Add the GitHub Secrets** listed above (generate a deploy key with
   `ssh-keygen -t ed25519 -C geist-deploy`, add the public key to the VPS `authorized_keys`, and put
   the private key in `VPS_SSH_KEY`).

After this, every merge to `main` deploys automatically.

## Backups & restore

- Location: `/opt/geist/backups/daily/` (last 7) and `/opt/geist/backups/weekly/` (last 4 Sundays).
- Manual backup: `bash scripts/backup.sh`
- A pre-deploy backup is taken automatically by `scripts/deploy.sh`.

**Restore** a dump into the running database:
```bash
gunzip -c backups/daily/geist-<stamp>.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

## Data safety across deploys

- Postgres uses the named volume `postgres_data`; `docker compose up -d` does not recreate it, so
  data survives every app redeploy.
- Backend migrations are idempotent (`CREATE TABLE IF NOT EXISTS`) and run at startup, so schema
  updates never drop data.
- The pre-deploy dump plus daily/weekly rotation provide recovery points.

## Rollback

Redeploy a previous commit's images by pinning the tag and re-running compose:
```bash
cd /opt/geist
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<old-short-sha>/" .env
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```
