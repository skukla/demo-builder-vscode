---
name: scrape-reference-site
description: Orchestrates the EDS site-scraping workflow for Demo Builder demos. Use when the user wants to build an EDS demo whose blocks visually match a reference site (their own site, a competitor's, or any URL they have permission to scrape). Routes between the Mod Agent (browser, highest fidelity, manual handoff) and Playwright MCP (automated, stays in IDE, lower fidelity ceiling).
---

# Scrape a reference site for an EDS demo

Use this skill when the user asks to build an EDS demo that visually matches a reference URL. This is the **entry point**; it routes to one of two workflows.

## Scope and permission

Scrape only sites the user owns or has explicit permission to scrape. Before starting, confirm with the user that the target URL is one of:

- Their own site (current employer, personal project, or staging environment).
- A competitor's site they have written permission to reference.
- A public marketing or product page they intend to use as a public demo reference.

If the user can't confirm permission, stop and ask. Do not silently proceed against arbitrary URLs.

## Route the workflow

Ask the user this question first:

> "For this scrape, would you like to use the **AEM Modernization Agent** (browser, highest fidelity, ~15-20 min per page including refinement, manual handoff via GitHub) or **Playwright MCP** (automated inside this IDE, faster, lower fidelity ceiling)?"

### Workflow A — AEM Modernization Agent (best quality)

Choose this when the user wants pixel-close visual fidelity and is OK with a browser context switch.

1. Confirm the user has access. If unsure, run the palette command `Demo Builder: Open AEM Modernization Agent` — it opens `aemcoder.adobe.io` in the browser. If the user sees "Access Denied" there, route them to request access:
   - **Adobe employees**: post in Slack channel `#aem-agent-experience-modernization-users` with their `@adobe.com` email. ~10 min provisioning.
   - **Partners / customers**: request access through their Adobe account manager. Or try the free sandbox at `https://www.aem.live/developer/aem-playground` (30-day).
2. With access confirmed, run the palette command. The Mod Agent web console opens.
3. **First time per project**: connect the Demo Builder project's GitHub repo in the Mod Agent UI. Install the AEM Code Connector and AEM Code Sync GitHub apps when prompted. (Future Demo Builder versions will automate this step.)
4. In the Mod Agent chat: provide the reference URL and a clear prompt. Iterate conversationally there. The Mod Agent commits generated EDS blocks to the GitHub repo via AEM Code Sync.
5. Switch back to VS Code, `git pull`, and continue with the demo-specific specialization skills:
   - `commerce-block-mapper` for PDP/PLP commerce dropins
   - `demo-data-injector` for mock data
   - `header-nav-footer` for site chrome

The Mod Agent handles its own refinement loop internally. The `refine-visual-match` skill is a no-op for this path.

### Workflow B — Playwright MCP (automated, IDE-only)

Choose this when the user prefers to stay in the IDE, lacks Mod Agent access yet, or is OK with a lower visual fidelity ceiling.

1. `@playwright/mcp` is installed automatically into the project's isolated MCP tools dir (`<project>/.demo-builder-mcp/node_modules/`). No prereq step needed. If somehow missing, run **Regenerate AI Files** from the dashboard (it reinstalls the MCP tools) — not `npm install` in the storefront.
2. **First Playwright use** triggers a ~150 MB Chromium binary download into the OS-global cache at `~/Library/Caches/ms-playwright/`. Tell the user this is expected. The cache is shared across all projects, so the download only happens once per machine.
3. Use Playwright MCP to capture the reference:
   - `browser_navigate` to the URL.
   - `browser_snapshot` for the accessibility tree.
   - `browser_take_screenshot` at 1440px and 375px viewports.
   - `browser_evaluate` to dump computed styles via `getComputedStyle` for major sections.
   - `browser_network_requests` to capture font URLs.
4. Save the captured bundle to `.scraped/<domain>/` in the project. (The project's `.gitignore` excludes `.scraped/` so these don't get committed.)
5. Hand off to:
   - `commerce-block-mapper` for PDP/PLP block decomposition
   - `header-nav-footer` for site chrome blocks
   - `demo-data-injector` for mock data
   - Existing AEM skills (`aem-block-developer`, `aem-content-modeler`, `aem-dropin-developer`) for the actual block authoring
6. Drive the iteration loop with `refine-visual-match`. Cap at 3 rounds. Report remaining deltas honestly.

For auth-protected pages, use `connect-authenticated-site` first to save a Playwright `storageState` for reuse.

## Fidelity expectations

Set the user's expectations honestly:

- **Marketing / editorial pages**: 80-90% first-pass, 95%+ after iteration cap.
- **PDP / PLP with commerce dropins**: 60-75% first-pass, 85-90% after iteration cap. Commerce dropins are Adobe-owned React components with a customization ceiling — `commerce-block-mapper` handles this honestly.
- **Animations / complex JS interactions**: 50-70%. EDS is static-first; some interactions don't translate.

**PDP URLs route automatically — don't replicate the reference's URL scheme manually.** When a scraped reference site uses paths like `/products/{slug}` or per-product files, you don't need to recreate that routing. Demo Builder's BYOM smart 404 + render-pdp overlay handles every `/products/{urlKey}/{sku}` URL on demand once the storefront is created or reset. Skip any "replicate the per-product page structure" subtask. Architecture: `docs/architecture/eds-byom-pdp-routing.md` in the demo-builder-vscode repo.

Demos for non-technical audiences usually accept brand identity, layout structure, and major sections looking right. Sub-pixel spacing rarely matters at the demo bar.

## Font and asset licensing

When the scrape surfaces font metadata, check the font's source before embedding:

- If it's an Adobe Fonts kit, map to the kit ID; don't re-host the file.
- If it's Google Fonts, link via the Google Fonts CDN.
- If it's a paid commercial webfont, **do not redistribute**. Warn the user and use a visually-similar free alternative.
