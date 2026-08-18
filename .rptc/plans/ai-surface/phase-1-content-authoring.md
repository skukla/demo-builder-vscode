# Phase 1 — Content-authoring tools

**The only gap that changes what is POSSIBLE.** Everything else in the program makes an agent
better at what it can already do. This makes it able to build a storefront at all.

## The evidence

A full Bodea storefront build (2026-08-15/16) authored ~20 DA.live pages, rebuilt the nav,
generated 28 block-library doc pages and ran link-closure checks. **Every operation went through
raw `curl` against `admin.da.live` with a hand-rolled IMS token**, because none is reachable
through the MCP. An agent can `list_dalive_sites` and `cleanup_dalive_site` — list and destroy —
but cannot write a page to one.

For EDS this is the wrong gap to have: the storefront largely *is* its content.

## Scope — six tools, five of which only expose existing methods

| Tool | Wraps | New code? |
|---|---|---|
| `read_page` | — | **yes** — nothing reads DA source today |
| `write_page` | `daLiveSourceOperations.createSource` | exposure |
| `publish_page` | `helixService.previewAndPublishPage` | exposure |
| `list_content` | `daLiveSourceOperations.listDirectory` | exposure |
| `delete_page` (confirm-gated) | `daLiveSourceOperations.deleteSource` + `helixService.unpublishPage` | exposure |
| `read_published_page` | fetch `.plain.html` | **yes** — the verification primitive |

`write_page` takes a `publish` flag rather than forcing a second call: that sequence was
invariant across every page authored in the build.

## Design decision: thin transport, not structured authoring

The agent composes EDS block markup itself; a skill teaches the shape. Rejected the alternative
(pass block id + rows, tool renders the markup) because it needs a schema per block type, and
Bodea's 28 blocks alone span key-value, positional and pipe-delimited conventions — it would
become a second `component-definition.json` to maintain.

**Revisit only with evidence.** The open question is whether agents get markup wrong once they
can look the shape up — which is what the paired knowledge tool is for.

## The knowledge tool that makes transport cheap

`get_block_authoring_shape(blockId)` — returns the `plugins.da` row already sitting in
`component-definition.json`: rows, columns, key-value vs positional, field selectors.

**Measured:** a subagent spent **~121,000 tokens** deriving eight blocks' authoring shapes by
reading their JS. This returns the same answer in roughly 200. `component-definition.json` is
read by the promote flow but exposed by no tool, so that derivation was genuinely unavoidable.

This is the highest-ROI single item in the program.

## Traps the paired skill must carry

Each cost the reference build real time:

- The DA Library reads `content.da.live`, **not** the `aem.live` CDN. Checking the wrong surface
  reported 0/28 doc pages live when all 28 were fine.
- **`.da/library/*` paths DO preview and publish** — that had to be proven before trusting it.
- The content bus **rejects non-sheet JSON** (`error from content-bus` at preview). Block data
  files belong in the git repo (code bus), not DA.
- **A site's sitemap is not its page set.** 13 storefront pages existed on a source site and were
  absent from its sitemap; a sitemap-driven copy dropped them silently.
- Link checks that match only `href=` miss the URLs these blocks store as plain text in
  key-value cells — scanning tag-stripped text found 14 dead paths an href-only crawl could not see.

## Constraints

- `delete_page` is confirm-gated. Per the program's standing constraint, never
  enumerate-and-call: 8 tools take no required arguments and execute immediately.
- Every tool must carry the OUTCOME, not the dispatch — no fire-and-forget returns, and no
  `{success:true}` that reaches the model as `{}` (phase 2 exists because six tools do exactly that).
- House test pattern is the per-file `fakeServer` harness; assert gating, argument shaping and
  result. New handler means a map count pin moves.

## Done when

An agent can author, publish, list, read back and verify a page through the MCP, and can look up
a block's authoring shape without reading its source. Validation: repeat a slice of the Bodea
content build through tools only, with no `curl`.
