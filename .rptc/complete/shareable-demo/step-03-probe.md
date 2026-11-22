# Step 03 — Read a colleague's repository

Item: [[EDS-13a]]. Decisions: D3, D5, D6, D7, D10. Depends on the contract step (portable-demos/step-01-contract) (the slice type is the
result's shape).

**Reuse:** section D of `../portable-demos/reuse-map.md` lists every existing thing this step is built from and how (use as is / add to it / make it shared / build new). A new file, hook, shape or word not in that section names the row it replaces and why.

## Goal

One host-side handler (Pattern B: RETURNS its result) that takes a GitHub owner/repo and
answers: is it a storefront we can build on, of which kind; where its content is and whether
it is published; its store codes; its B2B posture; its template flag and default branch; and
the description file's content when present, marked as overriding.

## What exists to reuse

- `classifyRepoForStorefront` (`repoStorefrontReadiness.ts:87`): the three canonical files →
  `empty | storefront | not-a-storefront | undetermined`.
- `githubRepoOperations.ts` / `githubFileOperations.ts` for metadata and file reads with the
  SC's token (private repos work when they are a collaborator).
- `parseGitHubUrl` (`core/utils/githubUrlParser.ts`) and the charset asserts in
  `appBuilderComponentCatalogLoader.ts` (`assertGitHubName`, `assertGitRef`).
- The index probe: the URL built at `edsPipeline.ts:364` (`indexPath || '/full-index.json'`
  on `https://main--{site}--{org}.aem.live`), HEAD it.
- `fstabGenerator.ts:73` documents the exact `fstab.yaml` line to parse back.
- `config-template.json` documents the `config.json` keys: headers `Magento-Website-Code`,
  `Magento-Store-Code`, `Magento-Store-View-Code`; flags `commerce-b2b-enabled`,
  `commerce-companies-enabled`; `commerce-endpoint` host for mesh posture.
- `DefaultBranchNotice` for a non-`main` default branch.
- The handler lands in the EDS handler map (`edsGitHubHandlers.ts` family) so step 07 can
  expose it as a read descriptor row.

## Design

Result type in `src/types/` (never a literal): kind (`eds | headless | not-a-storefront`),
`contentSource?`, `contentPublished: { indexFound, pageCount? }`, `storeCodes?`,
`b2b: 'on' | 'off' | 'unknown'` with `b2bSource`, `isTemplate`, `defaultBranch`,
`description?` (the contract's storefront slice, when the file exists and validates) plus
`overrides: string[]` naming which read values the file replaced (D10: say what it
overrode), `warnings: string[]` in SC words. Headless marker and B2B drop-in names are
VERIFIED against `skukla/citisignal-nextjs` and `adobe-commerce/boilerplate-b2b-template`
before they are written; the plan does not state them.

Recognition (D30): before anything else, the owner/repo is compared exactly against every
shipped storefront's `templateOwner`/`templateRepo` (the seed rule in
`buildCustomIntegrationEntry`, `appBuilderComponentCatalogLoader.ts:266`: exact match, a
fork is not recognised). A match returns `shippedPackageId` and the dialog selects that card
instead of adding a demo.

Nothing is written anywhere by this handler (it will be a read tool).

## Tests first

Contract tier: fixtures captured from three REAL repos (a Demo Builder-generated EDS repo,
the B2B boilerplate, `citisignal-nextjs`) — say in the test file where each came from.
Then: not-a-storefront; missing `config.json` → codes absent, `b2b: 'unknown'`; missing
index → `indexFound: false` (no throw); description file present → its values win and
`overrides` names them; malformed description file → warning, read values stand.

## Done when

The handler answers for all three real repos in the Dev Host, and `mcp-live-probe` shows
the same answer through the read tool step 07 adds.

## Built (2026-09-12)

`probeSharedDemo` in `src/features/eds/services/storefront/sharedDemoProbe.ts`, behind the
`probe-shared-demo` handler (`probeSharedDemoHandler.ts`, registered in the wizard's
handler registry). The answer is a union the dialog branches on: `shipped` (the link is one
of our own templates, with the package id to select), `unreadable` (not found, no access,
or a canonical file could not be read; never a guess), or `read` with everything the goal
lists. Read-only: GitHub reads and one GET of the content index.

**Markers, read from the real repositories on 2026-09-12, not written from memory:**
headless is `dependencies.next` (`skukla/citisignal-nextjs`); B2B is any of five drop-ins
(`@dropins/storefront-company-management`, `-company-switcher`, `-purchase-order`,
`-quote-management`, `-requisition-list`) in `adobe-commerce/boilerplate-b2b-template`'s
package.json, none of which a B2C boilerplate ships. The B2B template carries no
`fstab.yaml` and no `config.json` at all (Demo Builder writes both), so for a bare template
the codes are absent and B2B comes from the dependency list.

**Precedence when sources disagree:** description file > `config.json` > dependencies, and
the result names the source (`b2bSource`) and the fields the file replaced (`overrides`).
The index probe follows the description file's content source and index path when it
overrides the fstab's.

**Reused, as the map said:** `classifyRepoForStorefront` as is; `GitHubRepoOperations.getRepository`
now surfaces `isTemplate` and `forkParent` (one `toGitHubRepo` builder replaced two
identical literals); the fstab parser is the inverse of `generateFstabContent`, beside it;
the config.json reader is `parseStorefrontConfigJson`, extracted from
`fetchServedStorefrontConfig` and shared with it; the description file is read by
`readSharedDemoDescription` beside `readProjectFile`, tolerant (unknown fields and a newer
version warn, never refuse); `assertGitHubName` / `assertGitRef` moved to
`core/utils/githubUrlParser.ts` and the App Builder catalog loader imports them from there.
The bundled catalog is exported from the resolver module for template recognition, so the
catalog-JSON chokepoint pin still holds at two files.

**Recognition (D30)** compares owner/repo case-insensitively (GitHub names are), exactly
otherwise: a fork of our template is probed like any other repository.

**Tests:** contract fixtures captured from the three real repositories (the fixture file says
which and what was replaced: the instance endpoint); every path in the plan's list; the
handler's guards; the parsers; the reader. One mutation-ledger entry was deleted rather than
re-anchored: the optional chain it excused now lives in a pure parser whose own test hands it
`null`, so the mutant is killed, not equivalent.

**Not yet done, from "Done when":** the Dev Host round trip needs a caller, which step 04's
dialog is; the agent-surface check needs step 07's tool. Both are recorded there.
