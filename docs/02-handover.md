# RocketSales Desktop - handover

Windows desktop app (Tauri 2) for RocketSales Backoffice. The web app stays the system of record; the desktop app
signs in against new `/api/v1/desktop/*` routes and shows the dashboard and the company's own menu. Pages that are not
migrated open in a restricted "classic" window that shows the existing web site.

Nothing existing was changed except one line in `src/lib/routes.py` (it appends `DESKTOP_ROUTES`). Nothing was committed,
pushed or deployed.

## 1. What is where

| Path | What |
| --- | --- |
| `src/desktop_api/` | Server side: tokens, rate limiter, models, service rules, handlers, dashboard and menu builders, admin page |
| `src/html/UI5.3/DesktopApp.html` | Admin page template (`/Settings/DesktopApp`) |
| `tests/desktop_api/` | Server tests (run with pytest, no Datastore needed) |
| `desktop/src-tauri/core/` | Rust core: all rules (session, refresh, offline copy, URL allow-list). Testable without Tauri |
| `desktop/src-tauri/src/` | Thin Tauri shell: commands and the classic window |
| `desktop/src/` | React + TypeScript + Ant Design + TanStack Query + ECharts |
| `.github/workflows/desktop-windows.yml` | Builds the installer and publishes a release asset |
| `desktop/scripts/build-windows.ps1` | The same build on a Windows computer |
| `docs/` | This file, the next-modules proposal (03), mock-mode screenshots |

## 2. Server set-up (needed once)

1. **Signing secret.** The API refuses to run without `ROCKETSALES_DESKTOP_TOKEN_SECRET` (at least 32 characters).
   Generate one on your own computer: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
   Set it as an App Engine environment variable. Do not put it in git. `.gitignore` already ignores `env.yaml`, so the
   usual way is an `env.yaml` with `env_variables:` plus `includes: [env.yaml]` in `app.yaml`. I did not edit `app.yaml`.
   Changing the secret signs every desktop user out.
2. **Switch a company on.** The company's own ADMIN opens `https://<company>.rocketsalespharma.net/Settings/DesktopApp`, ticks
   "enabled" and picks the offline days (1 to 60, default 7). A company that has not been switched on gets
   `company_not_enabled` at sign-in. The page is ADMIN-only and its POST needs the header `X-Requested-With: DesktopAdmin`.
3. **Switch a computer off.** The same page lists computers (one row per user and computer). "Switch off" blocks sign-in
   and refresh for that computer; the app wipes its saved data the next time it reaches the server. "Sign out" ends the
   refresh chain without blocking.
4. **Deploy hygiene.** There is no `.gcloudignore`, so `gcloud app deploy` would upload `desktop/` (including
   `node_modules` if present). I did not create one because adding it replaces gcloud's default ignore rules. Add one
   deliberately, or deploy from a clean checkout where `desktop/node_modules` and `desktop/src-tauri/target` do not exist.

## 3. How sign-in and tokens work

- Sign-in is `POST /api/v1/desktop/login` with company, email, password, device id and name. It uses the same lookup and
  the same normalisation (lower-case, trimmed) as the web `/Login`, and the same account checks as `ActionSupport`
  (role present, `password_login`, role permission bit). It ignores `active_status` and the single-session cookie rule, like the
  web login does for `active_status`.
- Access token: about 15 minutes, signed (HMAC-SHA256). Refresh token: 90 days, signed; the server keeps only a keyed hash
  per computer, plus the previous hash so a retry after a lost response still works.
- Failed sign-ins: 5 in 15 minutes locks that company+email and that company+IP for 15 minutes (`rate_limited`).
- The app keeps the refresh token in Windows Credential Manager (keyring), never in a file.
- The company is the first label of the host. The server address pattern is `https://{company}.rocketsalespharma.net` (full addresses on `rocketorder.net` are also accepted)
  (not confirmed for every company, see section 7). Override it per computer with `config.json` in the app data folder:
  `{"base_url_template": "https://{company}.example.com"}`. Plain `http` is accepted only for `localhost` hosts.

## 4. Offline copy

- The last dashboard and menu answers are saved in SQLite, encrypted with AES-256-GCM. The key is in Credential Manager.
  Each row is bound to company, user, saved time and expiry; a row whose dates were edited is rejected.
- A saved copy is usable for the company's offline days. After that it is deleted and the app asks to go online.
- Sign-out, "switch off" and a different user signing in wipe the copy and the key.
- When offline the screen says so and shows "Saved copy from X ago".

## 5. What is migrated and what stays classic

| Area | State |
| --- | --- |
| Sign-in, per-company switch, offline days, device list | Native |
| KPI dashboard (`LoadKpiDashboard` payload, same builder) | Native |
| KAS dashboard (`LoadKASDashboard`) | Server payload is built, but the app shows a notice and opens the web page in the classic window |
| Menu | Built from the company's own menu template, grouped into 11 sections |
| Every other page | Classic window (existing web page) |

The classic window: only the company host (or a subdomain), same scheme and port. It has no access to the app's commands
and does not share the app's sign-in, **so it asks for the web login once**. It closes on sign-out, switched-off computer and expired session.

## 6. Build

- **GitHub:** run the `desktop-windows` workflow (manual, or a push to `main` that touches `desktop/`). It runs the type
  check, front-end tests and Rust core tests, builds the NSIS installer and publishes release
  `desktop-run-<run number>` with `RocketSales-Desktop-<version>-run<N>-setup.exe` and a `.sha256` file. Downloads come from
  the Releases page, not build artifacts.
- **Local:** on Windows, `cd desktop; .\scripts\build-windows.ps1` (needs Node 22, Rust MSVC toolchain).
- **Try the screens without a server:** `cd desktop; npm run dev:mock`, then open `http://localhost:1420/?scenario=<name>` with
  `default`, `kpi`, `offline`, `login`, `expired`, `unsupported` or `revoked`. The mock code is not in the installer build (checked).
- **Code signing:** the installer is unsigned, so Windows SmartScreen will warn. Signing needs a certificate; I did not set one up.
- **Version:** set it in `desktop/src-tauri/tauri.conf.json` (and keep `package.json` and the Cargo files in step).

## 7. What was tested and what was not

Tested (run here):
- Server: 91 pytest tests pass using an in-memory repository. They cover tokens, rate limiting, sign-in/refresh/logout rules,
  JSON error handling, the menu pipeline over every menu template file for an ADMIN and a non-admin role, and the dashboard
  stand-in (with a static check on the attributes the web builders read).
- Rust core: 31 tests pass (session with a scripted fake server and fake clock, offline expiry, revoke and wipe, token
  rotation, encrypted cache incl. tampering and "no plaintext on disk", URL allow-list, config).
- Front end: type check, 18 unit tests, production build, and mock-mode screenshots in a headless browser (`desktop/docs/screens`).
- The Tauri shell crate compiles on Linux (`cargo check`).

Not tested (be careful before relying on these):
- **Nothing ran against a real Datastore.** `NdbRepository`, the HTTP handlers and the dashboard builder were only tested with
  fakes. The Datastore emulator was not available. Do a first run against a test company before any real one.
- **No Windows run at all:** the installer, Credential Manager storage, the classic window (`on_navigation` allow-list), NSIS
  install and the GitHub workflow have never executed. The workflow file only parses as valid YAML.
- No test against a real menu export from your companies (a per-company export of `domain`, `menu`, `newWebView`, `country` and `package.count` is still needed).
- No load test; the dashboard time limit is 120 seconds and was not measured on a big company.

## 8. Known gaps and decisions

1. The company's own ADMIN switches the desktop app on (not the super admin).
2. KAS companies get the notice and the classic dashboard, not a native one.
3. The classic window needs a separate web login.
4. Icons are made from a 244 px logo, so they are soft. Supply a larger square logo and run `npx tauri icon <file>`.
5. Open questions still stand: host pattern per company, whether desktop sign-in should also require
   `active_status`, and the single-session rule.
