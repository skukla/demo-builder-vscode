# Handoff — 2026-08-10

Written at the end of a very long session. Read §1 before touching anything: some
of it corrects claims made earlier in the same session.

## 0. State

**Shipped and pushed.** `demo-builder-vscode` @ `f65280ca` on `develop`;
`accs-discovery-service` @ `e4e9cca` on `main`, **deployed** to
`285361-249darkllama-stage`.

| Commit | What |
|---|---|
| `568b1abe` | Plan steps 01–05 — probe honesty, real-SKU leg, setup caveats, `suffix` docs, version leg |
| `4b517cfb` | Four bugs: prompt suppression, published-state record, scope ownership ×2 |
| `f65280ca` | Two-cause verdict for a 404 PDP |
| `e4e9cca` (other repo) | `GET /__version` on `render-pdp` |

Gate at handoff: **947 suites / 12111 tests**, whole-repo lint, `tsc` — all clean.

**Verified live** against `skukla/demo-builder-test`:
- Green: `Orchard1-1` → published → probe reports `served: true`
- Red: `DigiWristExplorer` (catalog-confirmed, unpublished) → `served: false`
- `/__version` → `sha e4e9cca`, matching HEAD; `probeOverlayVersion` reads it
- Dispatch controls after deploy: non-PDP 404, `/products/default` 404, real PDP 200

---

## 1. MUST INVESTIGATE — a TOCTOU I introduced earlier today

**`removeIfStillOurs` in `src/features/ai/server/inExtensionMcpServer.ts`.**

```js
current = await fsPromises.stat(bound.path);        // matches our inode
if (current.dev !== bound.dev || ...) return;       // not ours → skip
await fsPromises.rm(bound.path, { force: true });   // ← window
```

On a window reload the outgoing server's `dispose()` races the incoming server's
`bindSocket()`. If the new server's `rename()` lands between that `stat` and that
`rm`, **the old server deletes the new server's socket**.

Observed at 12:15 local. `lsof` showed the extension host listening while `ls`
showed the directory empty — a live listener on a path no client can resolve.
That is the same symptom as the bug the rename-into-place work was written to fix
(`21d05dda`), narrowed to a specific interleaving rather than happening every
reload. Recovers on the next reload, so it looks intermittent.

**Do not paper over it.** There is no atomic "unlink if inode matches" on POSIX.
The two real options:

1. **Stop deleting the shared name at all.** Self-healing: the next bind renames
   over whatever is there, and `discoverLiveSocket` already probes liveness and
   skips dead files. **Cost:** `resolveProxyTarget`'s `env` and `cwd` branches
   test *existence*, not liveness, so a stale file from an exited window would
   strand the proxy on those branches — which is exactly the failure `26937e42`
   fixed. Taking this option means changing those branches to probe liveness,
   and the existence check was a deliberate choice (the proxy's connect-retry
   window owns activation races). Re-read that reasoning before changing it.
2. **Keep cleanup, shrink the window** — e.g. open the path, `fstat` the fd,
   compare, unlink. Still TOCTOU, just smaller. Probably not worth it.

My inclination is (1) done properly, but I deliberately did not attempt it at the
end of this session. It needs fresh attention on the whole discovery contract, not
a patch.

**Related, separate:** a **jest process alive 4 days 13 hours** (`pid 82596`) was
holding `/T/demo-builder-mcp/135b859e0a31db31.sock` — the REAL per-workspace
socket path, not an isolated test dir. Some test binds the production path and
leaked a worker. That means test runs and a live Dev Host contend for the same
socket. Worth its own fix; likely a missing cleanup or a missing tmpdir override.

---

## 2. The duplication / scope data-model fix

Four resolvers over `componentConfigs`, each with its own tiebreak. Two are fixed;
the underlying duplication is not.

**Fixed today** — both now consult `BACKEND_OWNED_SCOPE_KEYS`
(`src/features/components/config/envVarKeys.ts`):

| Resolver | Old tiebreak |
|---|---|
| `mergeComponentConfigs` (→ `config.json`) | mesh wins every key |
| `envFileGenerator` value lookup (→ component `.env`) | first in key order wins |

**Still outstanding:**

1. **The duplicate itself.** Mesh component configs still carry a copy of
   website/store/store-view in every existing manifest. Nothing reads it as
   authoritative now, but it will drift again and the next resolver will find it.
   The fix is a migration that strips scope keys from non-backend component
   entries on load, plus whatever writes them in the first place — find that
   writer; I did not.
2. **`updateStorefrontState` callers.** `edsResetService.ts` and
   `executor.ts` still pass `project.componentConfigs` (current) rather than a
   snapshot of what was published. Narrower window than the republish path that
   actually broke, but the same pattern. Fixing needs a snapshot threaded through
   `EdsResetParams` / the creation pipeline. Both are annotated in place.

---

## 3. Corrections to things said earlier in this session

Do not trust the earlier narrative over these:

- **"The instance has no Catalog Service index."** Wrong. The error is
  `No index was found for this request` — **scope-specific**. Under the
  `citisignal` scope both `products(skus:)` and `productSearch` work fine.
- **"No MCP tool exposes the project's Commerce config."** Wrong — `get_project`
  returns it. What is genuinely missing is **store structure** (what
  websites/stores/views exist on the instance): `commerceStoreDiscovery.ts` can
  list them, the wizard uses it, and there is no MCP wrapper. That gap cost most
  of an afternoon — an agent debugging "why don't PDPs work" cannot discover that
  the project points at a website with no products. **Recommend a read-only
  `get_store_structure` tool.** This is the highest-value item in this file.
- **"Redeploy the mesh so its `.env` carries citisignal."** Wrong.
  `regenerateProjectEnvFiles` is called only from **Configure save** and project
  reset — `deploy_mesh` deploys whatever `.env` is on disk. Correct order:
  Configure save → then deploy mesh.
- **"The config.json was half-updated."** Wrong framing. It is one file; the
  endpoint changed between two fetches while the scope never did.
- **"The Dev Host must have closed."** Wrong — it was open; the socket file was
  gone (see §1).

---

## 4. Outstanding work on `demo-builder-test`

The storefront is **repaired for the storefront path**: `config.json` carries the
citisignal scope, and `Orchard1-1` serves.

**Not done:** the mesh still runs on `base`. Its `.env` is stale and
`deploy_mesh` will not regenerate it. Sequence:

1. Configure → save (regenerates `.env` via the fixed generator; the suppression
   fix means the apply prompt now appears)
2. Deploy mesh

A `deploy_mesh` through MCP **timed out at 10 minutes** in this session and its
outcome is unknown — check `appBuilderComponents['eds-accs-mesh']` before
assuming it needs re-running.

Note: the mesh forwards the storefront's `headers.cs`, so product resolution
already works without this. The stale `.env` matters for anything the mesh does
with its own scope.

---

## 5. Release `.127` — NOT yet

User wants one more feature in first. When it is time:

- **It is `.127`, not `.128`.** `package.json` already says `1.0.0-beta.127` and
  there is no `v1.0.0-beta.127` tag or release — the bump came from the `.126`
  hotfix merge-back and was never cut. Do not apply the usual +1.
- **Notes are the work: 430 non-merge commits** since `v1.0.0-beta.126`, because
  `.126` was a hotfix off `.125` and develop diverged. Expect add-then-remove arcs
  across that range; describe net shipped behaviour. Do this with fresh attention,
  not at the end of a session.
- Follow the `cut-release` skill. It also says to offer `codebase-sweep` and
  `dream` first — see §6 for why `dream` has unusually good material.

---

## 6. Recheck my work — where to look hardest

My error rate this session was high. Everything below was caught by a test or a
control, not by me reading output, which is the argument for controls but also a
signal about the session:

- Three wrong test fixtures (invented shapes instead of reading the real ones):
  `isEdsProject` keys off `selectedStack`/`componentInstances`;
  `getBackendId()` reads `config.components.backend`.
- A scope sweep whose **control proved it could not discriminate** — a
  nonexistent website code returned the same as the real one. Eight rows that
  looked like evidence were noise.
- Several confident wrong conclusions, all listed in §3.
- `curl` without `--compressed` made `grep` return *empty*, not `0` — the
  gzip trap the original probe plan had already documented.

**Highest-value recheck targets**, in order:

1. §1 — the socket TOCTOU. It is a live defect in shipped code.
2. The `pdpCaveats` channel end-to-end in a real wizard run. Its unit tests pass,
   but the completed-screen rendering was never exercised live.
3. `pickSampleSku` reading the **project manifest** rather than the storefront's
   **served `config.json`**. `check-sku-exists` reads the served config, which is
   the right source; the probe should match it, or it samples from a different
   source of truth than the storefront uses. Recorded as an intended change and
   never made.
4. The `.env` scope fix against a **PaaS** project — every live check today was
   ACCS.

### One pattern worth a `dream` pass

Today produced **five** instances of the same disease: *state recording intent
rather than reality.*

1. The probe reporting `prerendered` for a page that was never prerendered
2. The dashboard "Frontend" badge reading a persisted string, not the network
3. `edsStorefrontState` recording what we meant to publish
4. The republish reporting `success: true` while publishing the wrong content
5. The 404 verdict asserting a cause it could not distinguish

That is not five coincidences. Whatever review or authoring habit lets this
through is worth naming explicitly in a skill or in CLAUDE.md.
