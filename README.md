# RocketSales Desktop

Windows desktop app (Tauri 2, React, TypeScript, Rust) for RocketSales Backoffice. It signs in against the web app's
`/api/v1/desktop/*` routes, shows the dashboard and the company's own menu, keeps an encrypted offline copy, and opens
pages that are not migrated yet in a restricted "classic" window.

- Handover, set-up, build and what was tested: [docs/02-handover.md](docs/02-handover.md)
- Next modules to migrate: [docs/03-next-modules.md](docs/03-next-modules.md)
- Try the screens without a server: `npm ci && npm run dev:mock`, then open `http://localhost:1420/?scenario=default`
- Build the installer: the `desktop-windows` GitHub workflow, or `scripts/build-windows.ps1` on Windows

The server side lives in the web app repository (`src/desktop_api`).
