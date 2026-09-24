---
id: AB-26d
kind: feature
area: app-builder
parent: AB-26
needs: []
value: med
status: built
---

# Headless screen checks over the ERP preview (T-2)

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1.**

## What

A script drives the ERP preview (`npm run preview`) with a headless browser — never the owner's Chrome — and asserts per screen: rendered, expected documents and actions present, console clean, computed-style fingerprint equal to the last accepted one (the `webview-visual-baseline` idea on the ERP). Runs in `npm test` for the screen.

## Verification block (checked by the loop's done gate — §6a of the plan)

Every screen in the preview has a check; a deliberate fingerprint re-accept is a reviewed diff; the 2026-09-24 Spectrum table crash, replayed, fails it.

## Shipped so far
- 2026-09-24  Started: Playwright + headless Chromium installed in demo-erp (devDependency); test will start the preview server in-process and fingerprint every screen
- 2026-09-24  BUILT on demo-erp loop branch: test/screens.test.js — 9 areas + 5 documents, console clean, computed-style fingerprint vs test/fixtures/screen-fingerprints.json, stable across 3 consecutive runs after adding a settle step (Spectrum grids size columns a frame after mount). Preview server exports startPreview(). Playwright devDependency; npx playwright install chromium once per machine.
