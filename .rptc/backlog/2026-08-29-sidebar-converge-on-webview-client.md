---
id: PL-19
kind: fix
area: platform
needs: []
value: med
status: backlog
title: The sidebar acquires the VS Code API itself — a latent double-acquire crash
parent: PL-30
---

# The sidebar is the only webview not using the shared client

Filed 2026-08-29 alongside ADR-017 §4, which rules that there is one channel per
bundle. This is the one entry that does not follow it. Split out because it is a
behaviour change, not a documentation one.

## What it does today

`src/features/sidebar/ui/index.tsx` declares `acquireVsCodeApi` itself, calls it
at module scope, and hand-rolls a local `sendMessage`. The other seven entries go
through `webviewClient` (`src/core/ui/utils/WebviewClient.ts`), which is 46 files
across the frontend.

## Why this is more than inconsistency

`acquireVsCodeApi()` can be called only once per webview; a second call throws.

The sidebar bundle does not currently import `WebviewClient`, so it acquires once
and works. But **every shared UI hook reaches the client**. The moment anyone
imports one into the sidebar — an ordinary, reasonable refactor — the bundle
acquires twice and the surface dies at load.

So the cost of leaving it is not the duplication. It is that the next person to
reuse a hook in the sidebar gets a crash with no obvious cause, and nothing in
the codebase warns them.

> **Verify first:** the once-only constraint is VS Code's and is documented in
> VS Code's webview API docs, not in this repo. It is the whole reason this item
> is `fix` rather than `chore`. Confirm it before scheduling the work — if it is
> wrong, this drops to a tidy-up.

## The work

Replace the local API acquisition and `sendMessage` with `webviewClient`, and
mount through `WebviewApp` as the other surfaces do. The sidebar's messages are
plain `postMessage` sends rather than request/response, so check whether it needs
the handshake `WebviewApp` provides or only the channel — do not assume it wants
the full wrapper just because the others use it.

## Done when

No entry calls `acquireVsCodeApi` except `WebviewClient` itself, the sidebar's
existing suites pass unchanged, and the surface is verified by hand in the
Extension Dev Host (this is a mount-path change; a green suite is not sufficient
evidence that a webview still loads).
