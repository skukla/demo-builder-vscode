---
name: connect-authenticated-site
description: Captures a one-time login session for an authenticated reference site so Playwright MCP can scrape pages behind a sign-in wall on subsequent runs. Use when the user wants to scrape pages that require authentication (logged-in PDP, customer dashboard, B2B catalog).
---

# Connect to an authenticated reference site

Use this skill when the user needs to scrape pages behind an authentication wall (logged-in PDP, customer dashboard, B2B-only catalog, staging environment with HTTP auth). The pattern is Microsoft's documented Playwright `storageState` flow: record the login once, reuse the session indefinitely.

## When to use

- The user picked Playwright MCP in `scrape-reference-site` and the target URL requires login.
- The Mod Agent failed because the site is behind auth (Mod Agent explicitly does not support intranet, VPN, or auth-protected sources).
- The user wants Playwright to remember a login across multiple scrape runs.

## Prerequisites

- `@playwright/mcp` installed in the storefront's `node_modules` (Demo Builder auto-installs it via the EDS Storefront component).
- Chromium binary downloaded on first Playwright use (~150 MB, one-time, shared via `~/Library/Caches/ms-playwright/`).
- The user has valid credentials for the target site.

## Steps

1. **Explain the contract.** Tell the user: "Playwright will open a real Chrome window. Log in to the site as you normally would. When you're done, Playwright will save the session to `.scraped/<domain>/auth.json` and reuse it on every subsequent scrape until the site forces a re-login. Credentials never leave your machine."

2. **Run the headful login session via Playwright MCP**:
   - Use `browser_navigate` to open the site's login URL.
   - Use `browser_resize` if needed to make the window comfortable to type in.
   - **Wait for the user to complete login.** They'll click Sign In, possibly do MFA, possibly accept cookies. Do not script any of this — the user drives.
   - When the user signals they're logged in (page shows authenticated state), use `browser_evaluate` to confirm a known authenticated DOM signal (e.g., a "Hi, &lt;name&gt;" greeting or a logged-in nav item).

3. **Save the session state.** Playwright MCP's storage-state APIs can persist cookies + localStorage to a JSON file. Save to `.scraped/<domain>/auth.json`. The path is project-relative and gitignored.

4. **Verify the session works.** Open a fresh Playwright context with the saved `storageState`, navigate to a known auth-protected URL, confirm it loads without redirecting to login.

5. **Hand back to `scrape-reference-site`** for the actual capture using the saved session.

## Session lifetime

- Sessions live until the site forces a re-login (cookie expiry, password rotation, server-side invalidation).
- If a later scrape redirects to login, re-run this skill to capture a fresh `auth.json`.
- For long-lived demo work, re-capture every 30-60 days as a precaution.

## What NOT to do

- **Never** ask the user for their password directly. They type it into the browser themselves.
- **Never** save credentials anywhere except the Playwright storage-state JSON (cookies + localStorage only).
- **Never** commit `.scraped/` to git. The project `.gitignore` should already exclude it.
- **Never** share `auth.json` outside the user's machine. Treat it like a credential.

## When this skill doesn't fit

- Sites with aggressive bot detection (Cloudflare advanced challenges, TLS fingerprinting) — Playwright may be flagged even with a real session. Fall back to pre-saved page bundles (manual browser "Save Page As" by the user).
- Sites that require MFA on every request (uncommon; usually MFA is a one-time-per-session check).
- IP-allowlisted sites where the user's current IP isn't on the allowlist.

If any of these apply, tell the user honestly that Playwright can't reliably scrape this site and ask what they'd like to do instead.
