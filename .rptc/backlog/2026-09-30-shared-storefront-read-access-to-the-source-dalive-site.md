---
id: EDS-22
kind: feature
area: eds
needs: []
value: high
status: active
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

## Design (owner's follow-up, 2026-09-30: "Can we not provide an interface, similar to the admin
user grant? … should we not include an intake for this as part of sharing the storefront?")

Yes to both, and the plumbing is mostly here.

**How DA.live grants read** (docs.da.live/administrators/guides/permissions, read 2026-09-30):
permissions are a `permissions` sheet in the ORG-level config (`/config/{org}`), rows of
`path | groups | actions`; `groups` takes IMS org ids, `orgid/group`, or plain email addresses;
actions are `read`, `write` (implies read and delete) or none (a deny); `/{site}/+**` covers a
site and everything under it, including its site-level config. The extension already reads a DA
config, merges rows into one sheet and writes the multi-sheet back preserving the others —
`daLiveConfigOperations.ts` does exactly that for site config and preserves the `permissions`
sheet on purpose. The org config is the same shape one level up.

**The trap, and why the roster pattern applies:** the moment an org config carries any
permissions row, everyone not listed loses access — the owner included ("Help! I messed
something up and cannot access my org" is in the FAQ, and the answer is Adobe Support). So the
writer is read-merge-write, never replace, and it always carries the owner's own `write` on
`/+**` and `CONFIG` — the same reason `grantSiteAdmin` is module-private and callers go through
`ensureSiteAdmin` on the Config Service roster.

**The interface.** On the sharer's side, one grant per reader: "Let <email> read this
storefront's content" → a `/{site}/+** | <email> | read` row in the sharer's org config, and its
undo (drop the row). Reachable from the Save as demo package dialog (the intake below), from the
dashboard's More menu, and as an agent tool (`grant_content_read` / `revoke_content_read`,
confirm-gated: it changes who can read the SC's content).

**The intake.** Save as demo package already writes the description file and hands back the
link. It gains "Who may read the authored content?" (emails, optional): each one gets the read
row, and the description file records that authored access is granted rather than published-only,
so the receiving side's probe (item 4 above) knows what to expect. Sharing by link stays
permission-free: published pages copy as today; the grant is what unlocks the library and the
unpublished pages.

**Who runs it:** the sharer, in their own org (their GitHub namespace, which is what the DA org
is here), with their own DA.live sign-in. Nothing in this design writes to anyone else's org.

## Not in scope

Granting on the colleague's behalf (DA permissions are theirs), and writing to their site.

## Shipped so far
- 2026-09-30  Shipped 2026-09-30 as hotfix beta.149 (master 5b6192ec1, tag v1.0.0-beta.149, GitHub pre-release with the VSIX): Manage Site Access manages content readers on DA.live beside the config admins — grantContentRead/revokeContentRead/listContentReaders on DaLiveConfigService (org permissions sheet, site path, owner's write rows first when the sheet is empty), contentAccessManagerHeadless (verify by re-read), the command's reader rows + a no-project org/site path, tools get_content_access / set_content_reader. Merged back: master → develop (32d18ed80) → loop branch. Not yet done from this design: the Save-as-demo-package intake and the receiving-side probe ('published only' vs 'authored site'); the Config Service adapter in the same shape. Not live-verified on a real org yet — Khalil's grant is the first real run.
- 2026-09-30  Owner, 2026-09-30: the code-derived library stays as the FALLBACK once EDS-22's authored copy exists. When a storefront is added by link with no read grant on the colleague's DA.live site, the project keeps rebuilding its library from the repo's component-definition.json (the blocks the code declares, generated examples), as today; the authored copy (.da/library and its doc pages) is the upgrade taken only when the grant is present. Neither path is the other's replacement.
- 2026-10-01  2026-10-01, from the AB-53 rebuild: the Commerce endpoint belongs on the DEMO, not on the create call. A shared storefront's config.json names the sharer's tenant, so the receiver must still be told which instance; create_project takes accsEndpoint and (since d699b6ec4) records it on the backend's config, but an added demo's row should carry it from intake beside the store codes it already records, so create_project needs no accsEndpoint and the catalog pre-warm never skips ('No Commerce/Catalog endpoint configured', justrite 2026-09-30).
- 2026-09-30  docs(backlog): EDS-22 keeps the code-derived block library as the fallback without a read grant (`e42005243`)
- 2026-09-30  docs(backlog): EDS-22 logs the beta.149 ship and what the design still owes (`6c64a2eb3`)
- 2026-09-30  Merge branch 'develop' into loop/2026-09-30-erp-programme (beta.149: the content-read grant) (`66f91a773`)
- 2026-09-30  chore(release): bump version to 1.0.0-beta.149 (`52253d19f`)
- 2026-09-30  feat(eds): let a colleague read your storefront's authored content on DA.live (EDS-22) (`79612742f`)
- 2026-09-30  docs(backlog): EDS-22 design — a read grant on the sharer's DA.live org config, and an intake in Save as demo package (`137b4a176`)
