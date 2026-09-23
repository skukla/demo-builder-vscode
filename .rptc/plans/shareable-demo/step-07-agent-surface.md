# Step 07 — The same actions for AI agents

Item: [[EDS-13a]]. Decision: D15. Depends on steps 03 and 05. Rules: `mcp-tool-authoring`.

> **Removed 2026-09-14 (step 11, D33):** there is no copy. An added demo reads from its link; `keepCopy`, `createFork`, `keepOwnCopy` and the delete-my-copy choice are gone, and Remove offers a delete only for a repository made from a zip. The text below is the record of what was built before.

**Reuse:** section H of `../portable-demos/reuse-map.md` lists every existing thing this step is built from and how (use as is / add to it / make it shared / build new). A new file, hook, shape or word not in that section names the row it replaces and why.

## Tools

| Tool | Kind | Backed by |
|---|---|---|
| probe a demo link | read descriptor row (`readDescriptors.ts`), `readOnly: true`, no writes hiding in the read | the step-03 handler |
| add a demo | action row, `readOnly: false`; remembers the link in the SC's setting; `keepCopy` (fork) defaults true and is a real cloud write, so `AGENT_ALERT_COPY` names the repo it will create | the step-04 commit path's host half |
| `list_demo_packages` | existing (`discoveryTools.ts:88`); returns added demos beside shipped ones with a `source` field | the resolver + the setting |
| `create_project` | existing (`createProjectTool.ts:416`); accepts an added demo's id, or a link (probe + add inline) | steps 03–05 |

Each carries the three declarations (`readOnly`, `TOOL_NARRATION` phrase written from the
description, `AGENT_ALERT_COPY` only if a dialog is raised: adding a demo raises none;
creating a project already does). Input schemas from the handler payload TYPES, `.strict()`
on the writers. Registered in `realSdkRegistration.test.ts`; counts bumped in
`dashboardHandlers-map.test.ts` and the descriptor suites; `docs/systems/mcp-server.md`
updated.

## Verify

`mcp-live-probe`: `serverInfo` names the build; the probe tool answers for the three real
repos from step 03; `create_project` with a link creates the same project the wizard does.

## Built (2026-09-12)

**`probe_shared_demo`** — a read-descriptor row over the dialog's own handler
(`probe-shared-demo` on the dashboard map). Takes owner+repo, or a `link` (a GitHub
link or the demo's site address), which the handler now reads to a repository the
way the dialog's field does. The row's `shape` answers the probe's result itself
rather than the `{result}` wrapper the dialog reads; the response-size suite says
plainly that it unwraps and does not shrink. `needsAuth: ['github']`, `readOnly`.

**`add_shared_demo`** — in `addedDemoTools.ts` beside forget and change source
(a direct registration: it composes the probe, the row and the add handler, which
a descriptor row cannot). `keepCopy` defaults true as the dialog's box does; because
that is a fork into the SC's account, the tool refuses without `confirm:true` exactly
when a fork would be made, naming the repository and the account, and needs no
confirm for `keepCopy:false`, the SC's own repository, or a fork that already exists.
Answers the `added:owner/repo` id `create_project` takes. A shipped template's
repository is answered with its package id instead of being added. No agent-alert
entry: a fork is recoverable (forget with `deleteCopy`), the same reasoning that keeps
`create_project` off that list. `readDemoRow` is the shared read-and-build step for
add and change source; the B2B question the dialog asks is not asked, and the
warnings say the unknown case reads as off.

**`list_demo_packages`** — the remembered demos follow the shipped ones, each with
`source: 'added'`, its `repository`, and the stacks of its kind; shipped rows carry
`source: 'shipped'`.

**`create_project`** — `package` may be an added demo's id, or `link` may stand in
for it (probed and added first, the copy kept unless `keepCopy:false`).
`createProjectPackage.ts` resolves what the creation builds on: for an added demo
the package is derived from its row for the chosen stack, the stack must be one of
its kind (the refusal names the demo's kind and its stacks), the derived package joins
the catalog the creation reads, and the row rides both the storefront-setup payload
and the wizard state exactly as the wizard sends them. `getAutoSelectedOptionalDependencies`
takes an injected package list so a row that requires a mesh seeds the same dependency
a shipped brand does. Unknown ids list the shipped and the added ids together.

**Pins moved:** the read-descriptor catalog (one row), the create tool's schema
(`link`, `keepCopy`, `package` optional at the schema level with the handler
insisting on one of the two), sign-in totals (GitHub 12 → 14, 113 tools), narration,
ceilings, two battery prompts (the probe as a read; add as tier 2), two mutation-ledger
anchors, and the generated tool catalog.

**Live check (2026-09-12, `mcp-live-probe` against a second VS Code window launched from
this worktree, `feature/colleague-storefront@c7c1d9863+`, 113 tools).** The probe read all
three real repositories from step 03 as expected: `skukla/kukla-bodea` → Edge Delivery,
B2B on from `config.json`, codes `bodea · bodea_store · bodea_us`, owner is the viewer;
`adobe-commerce/boilerplate-b2b-template` → shipped, `starter`;
`skukla/citisignal-nextjs` → headless on `master`, B2B unknown. The same repository read
from its site address gave the same answer; a bad link refuses in the field's words.
`add_shared_demo` from the site address (own repository: no fork, no confirm) put
`added:skukla/kukla-bodea` in `list_demo_packages` under the two Edge Delivery stacks;
`forget_added_demo` refused without confirm naming the demo and a project count of zero,
then forgot it, and the list was back to the three shipped packages.

**Found and fixed by the live check:** without a GitHub session the probe answered
"We couldn't find this repository, or you don't have access to it" for a repository that
exists, and the dialog would have said "not a demo" to an SC who opens Add a demo before
the Storefront step's sign-in. The probe handler now adopts the GitHub session VS Code
already holds (`adoptExistingGitHubSession`, shared with the auth check, which had the
same block inline) and, when there is none, refuses with `needsAuth: 'github'`; the
dialog shows "Sign in to GitHub first" and what to do. Confirmed live after a rebuild
and `reload_window`.

**Found and fixed by the live check (2):** `kukla-bodea` publishes no `/full-index.json`
while its home page is live and its pages are listed under `/sitemap.json`, the path the
Bodea brand's catalog entry names. The probe and the copy step each spelled the default
path themselves, so the probe said "no published pages" for a published site and a
project created from it through Add a demo would have copied nothing. Decided with the
owner (2026-09-12): **whoever names a content site names its index path.** The catalog
states it for every brand (Starter and CitiSignal now say `/full-index.json` instead of
relying on a default), the project row and the description file require it inside their
content-site block (the file's block itself stays optional), and every reader (the copy
step, the import path, the reset door) takes the stated path from `contentIndexUrl` in
`contentIndex.ts`; no reader has a fallback branch any more. Only the Add a demo probe
looks a path up, for a repository that names a site with no path, trying the shipped
brands' paths in order and recording the answer on the row (the first path, with "pages
not published", when nothing answers). The account-chrome source got its own site-only
type and schema shape, since pages are copied from it by path, not from a list.
Convention 113 in the handbook, enforced by `tests/sop/content-index-path.test.ts`: no
other source file spells an index path, every catalog entry states one, both schemas
require it, and the tried list covers every path the catalog names. Confirmed live before
the tightening: the same site answers `indexPath: /sitemap.json`, 157 pages.

**Live run of the whole flow (2026-09-12, owner's go-ahead, DA.live token pasted into the
second window).** The colleague's own repository is private to the owner's account, so a
zip the colleague had shared was pushed by hand to `kukla-demos/citisignal-b2b-summit` as
the stand-in (an organization repository, so the fork path runs). Through the tools:
`probe_shared_demo` read it (Edge Delivery, B2B on from `config.json`, content site
`vinodsivagnanam-pm/citisignal-b2b-summit` under `/sitemap.json`, 61 pages, no fork yet);
`add_shared_demo` refused without confirm naming the fork, then forked it into the owner's
account and remembered the row; `list_demo_packages` showed it under the two Edge Delivery
stacks; `create_project` built `summit-test` on `eds-paas` from the fork (49 pages
published, site live, the repository, the row and the fork recorded on the project);
`reset_eds_project` reset it (3,486 files, 83 pages copied, one caveat in the SC's words
about product pages with no matching product); `change_demo_source` pointed the project at
the organization repository and back, the row and the instance metadata moving together
each time. Cleanup: the project, its repository, the fork and the stand-in repository are
deleted, and the DA.live site `skukla/demo-builder-test-summit` too (69 items), after
one more finding: `cleanup_dalive_site` and `list_dalive_sites` built their DA.live
operations on the Adobe IMS token, which DA.live refused — it listed zero sites for an
org with six and answered 403 for a site the reset tool had just written to with the
DA.live session's token. The two tools now build on the DA.live session first, the IMS
token as the fallback they always had, and declare the DA.live sign-in. The human
"Cleanup DA.live sites" command wires the IMS token the same way; whether it works
against DA.live today is a separate question, worth a backlog item rather than a change
inside this step.

**Found and fixed by the live run (3–6):**
- The colleague's `fstab.yaml` is in the nested form (`/:` over `url:` and `type: markup`,
  the AEM Code Sync bot's); `parseFstabContentSource` read only the one-line form the
  extension writes, so the demo showed no content site. Both forms read now, the real file
  as the test.
- `create_project` never named the GitHub account to create the repository under, so every
  agent creation of an Edge Delivery project refused with "GitHub owner not configured".
  It names the signed-in account, or a `githubOwner` the caller gives; `buildProjectConfig`
  lets a stated owner win over the auth status (the wizard sets neither differently).
- `create_project` read the repository URL from the setup-complete payload under `repoUrl`,
  an invented key (the payload names it `githubRepo`), so the project was saved without its
  repository and reset would have refused it. The test fixture had invented the same key;
  both now use the declared type.
- The missing-referenced-pages notice closed with "the patch is likely obsolete" when no
  patch was involved; with only pages missing it now says they don't exist on the content
  site the demo copies from. The "Pinning to verified canonical state" progress line is
  announced only when there is a pin to make. The agent's progress card title lost its
  colon and ellipsis (VS Code adds its own colon before the phase). `change_demo_source`
  keeps the project's demo name unless a new one is given.

**Owner's report, after the live run (logged 2026-09-13).** Eighteen GitHub emails
"[skukla/demo-builder-test-summit] Build workflow run" failed between 11:00 PM and 11:26 PM
on 2026-09-12 — the window in which the test project was created and reset from the
colleague's repository. The colleague's repository carries `.github/workflows/main.yaml`
("Build": `npm ci` + `npm run lint` on every push, the aem-boilerplate's), and Demo Builder
pushes a commit per file it writes during setup and reset, so every push ran the workflow
in the new repository and every run failed there. Checked the same day: the shipped Isle5
template (`stephen-garner-adobe/isle5`) carries the same seven workflows, so this is not
specific to a colleague's demo; the Starter and BuildRight templates carry different ones
(`sync-from-upstream.yml`, `deploy-pages.yml`). Not fixed in this program. The candidate
fix is for repository creation to leave `.github/workflows/` out of the copy (or disable
Actions on the new repository through the API), which is a product decision: those
workflows are the template author's, and some SCs may want them. **Decided and fixed
2026-09-15 (owner):** Actions is turned off on every repository Demo Builder creates, inside
`createFromTemplate` and `createEmptyRepository`; the workflow files are kept.

**Two more colleague storefronts, read live (owner-requested, 2026-09-13; owner away, so
reads and the copy-free add only).** `sayurihanki/aistore`, by repository link and by site
address: Edge Delivery, public, `main`, no description file, 91 pages under `/sitemap.json`,
B2B on from `config.json`, codes adobe / aistore / usaistore, no warnings; added to the list
without a copy as "Aistore" and listed beside the shipped cards. `main--razer--sayurihanki.aem.live`:
the site is live (200 on `/` and `/sitemap.json`) but the repository the address names,
`sayurihanki/razer`, answers 404 to the owner's GitHub account too, so the probe refused it
("We couldn't find this repository, or you don't have access to it") — the right answer; a
private repository needs access granted or made public before "Add a demo" can read it.
The refusal now names both halves when the site answers but the repository does not
(`cannotReadReason` in the probe, one HEAD to the site's address, owner-requested the same
day): "The site main--razer--sayurihanki.aem.live is up, but its repository sayurihanki/razer
couldn't be found, or you don't have access to it. Ask its owner to make it public or give
you access." Jen's 53 public repositories carry no razer or razr; the repository is private. `create_project` from
Aistore was not run: it raises the consent dialog and nobody was at the computer. A stale
row, `added:skukla/citisignal-b2b-summit`, is still on the list from the summit test (its
repository was deleted); forgetting it needs the consent dialog too.

**Step 10** (add a storefront from a zip file) was added to the plan on the owner's request
the same day; the how-to will say to share the link, not a zip.
