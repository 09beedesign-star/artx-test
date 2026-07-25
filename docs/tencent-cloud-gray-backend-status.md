# Tencent Cloud Gray Backend Status

Last checked: 2026-07-06

## Current Server State

- Server: `43.161.241.133`, Debian 13.2, SSH reachable with the local `~/.ssh/artx_gray_ed25519` key on port `22`.
- Existing admin backend remains untouched:
  - App directory: `/opt/artx`
  - Service: `artx-admin.service`
  - Local port: `127.0.0.1:3001`
  - Data directory: `/var/lib/artx`
  - Public host: `admin.artxsd.com`
- New isolated gray backend:
  - App directory: `/opt/artx-gray-backend/current`
  - Release directory: `/opt/artx-gray-backend/releases/artx-gray-smoke`
  - Service: `artx-gray-backend.service`
  - Local port: `127.0.0.1:3002`
  - Data directory: `/var/lib/artx-gray`
  - Uploads directory: `/var/lib/artx-gray/uploads`

## Verified

- `http://127.0.0.1:3002/api/health` returns `{"ok":true}`.
- Nginx has a separate `artx-backstage` site and proxies `backstage.artxsd.com` to `127.0.0.1:3002`.
- Forced-host local Nginx check passes with `curl --resolve backstage.artxsd.com:80:127.0.0.1 http://backstage.artxsd.com/api/health`.
- Gray smoke test passed on the server:
  - backend health
  - image proxy
  - auth login
  - Wallyt signed callback against the gray data directory
  - Skill image generation through `product-photography`
  - generated image download through `/uploads/images/...`
- Server disk check: root disk is about `79G`, with about `71G` available at the time of the audit.

## Remaining Before Render Replacement Is Public

- DNS record `backstage.artxsd.com` `A` -> `43.161.241.133` is active.
- HTTPS certificate for `backstage.artxsd.com` is active.
- Public smoke passed:

```bash
BACKEND_URL=https://backstage.artxsd.com \
PUBLIC_URL=https://backstage.artxsd.com \
RUN_AUTH=1 \
RUN_WALLYT_CALLBACK=1 \
RUN_SKILL_IMAGE=1 \
node /opt/artx-gray-backend/current/scripts/verify-tencent-cloud-gray.mjs
```

- Automatic GitHub Actions deployment is defined in `.github/workflows/deploy-tencent-cloud.yml`; it requires the repository secret `TENCENT_CLOUD_SSH_PRIVATE_KEY`.

## Notes

- Do not repoint `admin.artxsd.com` to the gray backend unless intentionally replacing the existing admin service.
- Do not merge `/var/lib/artx-gray` into `/var/lib/artx`; they are intentionally isolated to avoid touching existing user/admin data.
- Credential values are only on the server environment files and are not copied into this document.
