# MEMORY

## Project

- Project name: New project 2
- Date initialized: 2026-06-20
- Visible stack: Vite/TypeScript web app with client, server, shared, pnpm, Render config, and GitHub Pages-style static build artifacts.

## Working Notes

- Follow `AGENTS.md` for ArtX test release workflow before any test environment publishing.
- Credential values are not stored here; only credential locations may be recorded if needed.
- Product model: users pay for compute, compute is converted into platform credits/points, and admin tooling should track feedback, payments, accounts, and quota/credit operations.
- Admin prototype should include a top-right notification center for urgent operations such as payment exceptions, runtime errors, integration latency, and credit/risk events.
- Admin backend is connected at `/admin-prototype`, but it must not be exposed in the main website navigation; production access should use an independent admin subdomain such as `admin.*` or `VITE_ADMIN_HOST`.
- Formal admin access uses role-based permissions: ordinary users are `viewer`, default `09bee` is `super_admin`, and admin routes require `admin:access` instead of only checking login.
- Canvas persistence rule: real user projects use `canvas-*` IDs and must keep the latest edited nodes/edges in local storage; non-real test canvas states can be reset without touching user projects.
- Image generation recovery rule: text-to-image tasks with a `generationId` are also started on the backend `/api/images/tasks` background endpoint, so closing the browser can still recover completed or failed results when the user returns.
