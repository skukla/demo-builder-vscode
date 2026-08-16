# Phase 1 · Step 02 — the six content-authoring tools

**The gap that changes what is POSSIBLE.** An agent can list and destroy DA.live sites today; it
cannot write a page to one. For EDS that is the wrong gap, because the storefront largely *is* its
content. Every page of the Bodea build went through raw `curl` with a hand-rolled IMS token.

## The finding that shapes the whole step: one page, three path spellings

This is the trap the plan did not have, and it is the main thing these tools are FOR. Measured by
reading the three call sites:

| Surface | Spelling for the same page | Enforced by |
|---|---|---|
| DA source API | `about.html` | `normalizePath` strips the leading `/` only — it never adds the extension, and the DA Admin API docs require it for files |
| Helix preview/publish | `/about` | `normalizeWebPath` adds the leading `/` and strips a trailing one — it never strips `.html`, so `/about.html` publishes the wrong path |
| `da.live/canvas` editor | `about` | extensionless; a `.html` suffix double-appends to `index.html.html` and the editor doc session dies while the page still renders |

An agent given raw transport has to know all three and convert between them on every call. **These
tools take ONE canonical web path (`/about`, `/`, `/products/shoes`) and derive the rest.** That
conversion is the value; raw exposure alone would just relocate the trap.

Two of the three conversions already exist as tested helpers and are reused rather than rewritten:
`resolveDaPath(webPath, isHtml)` and `buildSourceUrl(base, webPath, isHtml)` in
`daLiveContentHelpers.ts`. The third is `HelixService`'s own private normalizer, which
`previewAndPublishPage` already applies — so the web path is passed straight through.

## Auth: two different tokens, and the content path uses the DA.live one

The codebase holds two DA.live-capable token sources and they are NOT the same credential:

| Source | Used by | Correct here? |
|---|---|---|
| `DaLiveAuthService.getAccessToken()` — its own sign-in, own storage, own expiry | `republishStorefrontContent`, `sync_content`, the whole production content path | **Yes** |
| `tokenManager.inspectToken()` — the extension's Adobe IMS token | `cleanup_dalive_site`, `list_dalive_sites` (org-level reads) | No |

Both are Adobe IMS tokens, which is exactly why picking wrong fails as a 401 rather than a type
error. The `eds-publish-and-config` skill settles it independently: DELETE needs the DA.live
Bearer specifically, and once a site carries any `access.admin` role, **every** admin call does.
Storefront setup now pins an admin at registration, so that is the normal state.

**Preview/publish needs BOTH tokens** — `previewPage` sends `Authorization: Bearer <ims>`,
`x-auth-token: <github>` and `x-content-source-authorization: Bearer <ims>` on one request. So the
publishing tools pre-flight GitHub *and* DA.live, exactly as `sync_content` does.

## Scope

| Tool | Wraps | Auth | Gate |
|---|---|---|---|
| `read_page` | `GET /source/{org}/{site}/{path}` | DA.live | — |
| `write_page` | `createSource` (+ optional publish) | DA.live (+ GitHub when publishing) | — |
| `publish_page` | `previewAndPublishPage` | DA.live + GitHub | — |
| `list_content` | `listDirectory` | DA.live | — |
| `delete_page` | `deleteSource` + `unpublishPage` | DA.live + GitHub | **confirm:true** |
| `read_published_page` | fetch `.plain.html` off the CDN | none (public) | — |

`read_page` is the only genuinely new transport: **nothing in the codebase reads DA source today**
(verified — zero `GET /source` call sites). `GET /source/{org}/{repo}/{path}` is confirmed against
the DA Admin API spec and returns the raw body.

`write_page` takes a `publish` flag rather than forcing a second call: that sequence was invariant
across every page authored in the Bodea build.

## Target: the current project, with no org/site override

Every tool derives org/site from the current project's EDS storefront metadata, the way
`sync_content` does. **No `org`/`site` arguments.** An override would hand an agent a way to write
into and unpublish from any DA.live site the user's token can reach, with no confirmation on the
non-destructive paths. `list_dalive_sites` already covers cross-site *reads*; nothing needs
cross-site *writes*. If a real case appears, add it to the read tools only.

## Design decision: thin transport, not structured authoring

The agent composes EDS block markup itself; step 01's `get_block_authoring_shape` teaches it the
shape. Rejected the alternative (pass block id + rows, tool renders markup) because it needs a
schema per block type — and step 01 measured three incompatible conventions across 78 blocks, so
that schema is precisely the thing we just avoided maintaining twice.

## Traps the paired skill must carry

Each cost the reference build real time:

- The three path spellings above.
- The DA Library reads `content.da.live`, **not** the `aem.live` CDN. Checking the wrong surface
  reported 0/28 doc pages live when all 28 were fine.
- **`.da/library/*` paths DO preview and publish** — proven before trusting it.
- The content bus **rejects non-sheet JSON** (`error from content-bus` at preview). Block data
  files belong in the git repo (code bus), not DA.
- **A site's sitemap is not its page set.** 13 storefront pages existed on a source site and were
  absent from its sitemap; a sitemap-driven copy dropped them silently.
- Link checks matching only `href=` miss URLs these blocks store as plain text in key-value cells —
  scanning tag-stripped text found 14 dead paths an href-only crawl could not see.

## Constraints

- `delete_page` is confirm-gated. Never enumerate-and-call: 8 tools take no required arguments.
- Every tool carries the OUTCOME, not the dispatch — no fire-and-forget returns, and no
  `{success:true}` reaching the model as `{}` (phase 2 exists because six tools do that).
- House test pattern is the per-file `fakeServer` harness; assert gating, argument shaping and
  result.

## Done when

An agent can author, publish, list, read back and verify a page through the MCP. Validation:
repeat a slice of the Bodea content build through tools only, with no `curl`.
