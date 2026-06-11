# Step 02 — Route the Helix content-source auth header through `ContentSource`

**Goal:** Replace the hardcoded `x-content-source-authorization: Bearer <daLiveToken>` in `helixApiClient.ts` with `contentSource.getContentSourceAuthorization()`, DA.live behavior unchanged.

**Why separate from Step 01:** `helixApiClient.ts` is `vscode`-free and shared with `mcp-server.ts`. Isolating keeps the blast radius small and proves the MCP path unchanged.

## RED tests
- `tests/features/eds/services/helixApiClient.test.ts` (extend): **characterization** — given a DA.live content source, `buildHeaders` still emits `x-content-source-authorization: Bearer <token>` and `x-auth-token: <githubToken>` (byte-identical).
- New behavior: when `getContentSourceAuthorization()` resolves `null`, the `x-content-source-authorization` header is **omitted** (no empty Bearer). This is the AEM affordance.

## GREEN surface
- Edit `helixApiClient.ts`: `HelixTokens.daLiveToken` becomes a resolved `contentSourceAuthorization?: string` (resolve once before the request batch). Keep `githubToken` as-is.
- Edit the one `helixService.ts` caller that builds `HelixTokens` to source the header from the active `ContentSource`.

## REFACTOR
- Comment that the header is now content-source-neutral; the DA.live value is produced by `DaLiveContentSource`, not the API client.

## Done-when
- Characterization + omit-when-null tests green; MCP server path provably unchanged; full EDS regression green.
