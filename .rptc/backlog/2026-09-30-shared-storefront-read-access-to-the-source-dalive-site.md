---
id: EDS-22
kind: feature
area: eds
needs: []
value: high
status: backlog
---

# Shared storefront: read access to the colleague's DA.live site is the missing piece

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-09-30. Owner, on adding Khalil's Justrite storefront: "I think the shared ownership
of the site content via da.live is a missing piece of our shared storefront feature. If SCs had
read-only access, wouldn't it be easier to generate an accurate block library, for example?"

## What the feature reads today, and what it therefore cannot see

"Add a demo someone shared" (beta.148) reads the colleague's repository on GitHub and their
content through the PUBLIC CDN: the probe resolves the content source from `fstab.yaml` and
checks the site's published index (`sharedDemoProbe.ts`, `contentPublished`), and the copy at
project creation fetches each page's `.plain.html` from `main--<site>--<org>.aem.live`
(`daLiveContentCopy.ts`). No DA.live permission on the colleague's site is needed, which is why
sharing a link is enough. The price:

- **Only published pages exist.** Anything authored and not published — drafts, a page kept on
  preview, and every document under `.da/` — is invisible, because the CDN never serves it.
- **The block library is one of those.** DA.live keeps a site's library as
  `.da/library/blocks.json` plus a doc page per block (`daLiveBlockLibraryOperations.ts`). A
  colleague's library — the authored examples, the variants they actually use — is under `.da/`
  and is never published. So a project built from a shared storefront rebuilds its library from
  `component-definition.json` in the code (`refreshBlockLibraryHeadless.ts`): the blocks the code
  declares, with stub examples, not the ones the colleague authored.
- **Block shape reads are approximate.** `get_block_authoring_shape` and the promote flow read
  rendered HTML; the authored table (DA's source HTML) is what a block's variants are declared
  in. The 2026-08-16 finding — 74 of 78 real components did not match the shape written from
  the promote flow — is the same gap seen from the agent side.

## What read access buys

With the SC's IMS account granted **read** on the colleague's DA.live org/site (DA's own
site-permissions sheet; the colleague grants it, nothing here can), the extension can:

1. Copy the library as authored: the `.da/library/blocks.json` sheet and its doc pages, into the
   SC's own site — an accurate library on day one, no rebuild from code.
2. Inventory the blocks and variants actually used across the authored pages (DA source, not
   `.plain.html`) and generate library entries for what the code declares but the library omits.
3. Copy unpublished pages the colleague meant to share (a page kept on preview for the demo).
4. Say plainly, at probe time, which of the two the SC has: "published pages only" vs "the
   authored site" — a DA source GET on the site answering 200 vs 401/403 — and what to ask the
   colleague for when it is the first.

Read-only is the right grant: the SC's project copies into its own site and never writes to the
colleague's. "Shared ownership" is the wrong word for what is wanted; shared READING is.

## Not in scope

Granting on the colleague's behalf (DA permissions are theirs), and writing to their site.

## Shipped so far
