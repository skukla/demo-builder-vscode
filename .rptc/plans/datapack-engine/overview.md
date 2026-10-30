# Demo Builder installs datapacks itself, beside the service: plan (2026-10-27)

Backlog: [DI-5](../../backlog/2026-10-27-demo-builder-installs-datapacks.md). Supersedes the
"install" half of `.rptc/plans/datapack-primary/` (on `feature/datapack-zip`), which proposed the
same direction and left it undecided. Research: `.rptc/research/datapack-engine/`
([catalog-spec.md](../../research/datapack-engine/catalog-spec.md),
[export-spec.md](../../research/datapack-engine/export-spec.md),
[library-audit.md](../../research/datapack-engine/library-audit.md)).

## Why

The Data Installer service is not something we can rely on (owner, 2026-10-27). In one day:
its old address went dark (404); its new Production deployment cannot reach its own database;
its new Stage deployment needs an org header we did not send (fixed in beta.150/151); and a
commit that morning ("remove the postman backward compatibility params") made it ignore the
Commerce credentials callers send, so every dry run and import now fails with "Pre-flight
check failed for all configured site types (accs, local)". Reading still works: the catalog,
every pack, every item.

## The shape (owner, 2026-10-27)

- **Two engines behind the same buttons.** Dry run, install and remove look and work the same
  for the SC, from the screen, the wizard's creation step and the agent tools. Underneath:
  the **Demo Builder engine** (new: writes the pack into Commerce over REST from the
  extension) and the **service engine** (what exists today, unchanged).
- **One setting picks the engine.** `demoBuilder.dataInstaller.engine`: `demo-builder` or
  `service`. If the service is fixed, switching back is a setting change.
- **Our engine installs a pack from wherever the screen lists it** (owner, 2026-10-27): the
  service's catalog, the datapack library, or a datapack zip file. It needs only the pack's rows,
  so a library pack is installed straight from the library, with no copy into the service's
  catalog first. That copy ("Copy to the Data Installer", `copy_library_datapack_to_installer`)
  is kept only for the service engine, which can install nothing else; it cannot be undone from
  the extension and has never run live. Store-settings packs (step 09) depend on this, since the
  service's catalog will most likely refuse that kind. The library and zip files came in by
  merging `feature/datapack-zip` into this branch.
- **Each installed pack records which engine installed it, and removal always goes through
  that engine.** Each engine knows exactly what it wrote; nothing either creates is ever
  removed by the other, and nothing is stranded (rule 1: whatever can be done can be undone).
- **Our engine's record of what it created lives beside the project**, not in the manifest:
  one file per installed pack, listing every Commerce object it created by kind and id. The
  manifest's `datapack` gains `engine`.

## What is reused, and what is not (owner, 2026-10-01 rule, reaffirmed today)

Reused: all the DATA (read from their catalog), all of their KNOWLEDGE (we read their
processors as the specification: order, endpoints, request shapes, transforms, the quirks
they hit, how they remove), and our own parts (Commerce REST writes from the ERP work, the
progress window, agent tools, the datapack library and zip files). Not reused: their code.
Ours is written from scratch, tested, and checked live.

## Where packs live: the library is home, the service is read (owner, 2026-10-27)

- **The library is where the team's packs live.** It answers the same routes as the service's
  database (datapack-store step 02b), so one writer (`writePackToStore`) puts a pack into
  either store, and one reader (`readPackFromStore`) reads from either.
- **The service is a source we read from, not something we depend on.** Reading works; its
  install, removal and export do not. Our engine installs a service pack by reading its rows
  from the service, with no copy first. A pack we depend on should also be in the library,
  since the service's reads have failed before (its old address went dark).
- **"Copy to the Data Installer" stays**, with its agent tool, and it is the way back to the
  service: the service engine installs only packs in the service's own database, so if the
  service is fixed, or we are allowed to upload into it, a library-only pack is copied there
  first. It still cannot be undone from the extension and has not run live.
- **Export is the gap.** Export, reading a store an SC set up into a new pack, is the only way
  new packs are made, and the service's has failed to save what it reads since August. Ours
  is written per data kind, beside its install and removal, and writes into the library.
- **Next, in order:**
  1. **Audit the service's 42 packs** (read-only): done 2026-10-27, see
     [library-audit.md](../../research/datapack-engine/library-audit.md).
  2. **Bring the kept packs into the library** with the existing copy from the service.
  3. **Keep in step, one way, service to library:** a pack is its name plus version; bring
     over any pair the library lacks and never overwrite one it has. On demand first.
  4. **Research:** whether a Stage workspace has limits or clean-up rules a production one
     does not, before the library is relied on.

## The hybrid: the service's catalog, our engine, zip files and settings (owner, 2026-10-28)

We do not change the Data Installer service: it is not ours, and since 2026-10-28 its code is
not visible to us. Everything it lacks is added around it.

| Piece | Who does it |
|---|---|
| The catalog of existing packs | the service (reading works) |
| Zip files, our own packs, edited copies | us: the zip loader and our library |
| Install and remove | us: Demo Builder's engine, the default since 2026-10-28 |
| Store settings, which the service cannot set | us: a settings layer beside each pack (step 09) |
| Packs for demos not built with Demo Builder | published to the service's catalog, settings split off (step 13) |

Two decisions keep the way open for the service to take settings over later (step 09): the
layer is stored as ordinary pack rows, and when a pack carries settings itself, the pack wins.

## Steps

| # | Step | Status |
|---|---|---|
| 01 | [The engine seam, no behaviour change](step-01-engine-seam.md) | done |
| 02 | [The install record and the catalog kinds](step-02-catalog-kinds.md) | done, not yet live |
| 03 | [Wire the engine together](step-03-wire-engine.md), then make it the default | in progress |
| 04 | [One rule for "is this still as we left it?"](step-04-still-as-we-left-it.md) | done |
| 05 | [Capture and repeat installs](step-05-capture-and-repeat-installs.md) | built, not yet live; the removal box and the "Always" setting can now be built (07 is in) |
| 06 | [The setup guide's undos keep what changed since](step-06-setup-guide-undos.md) (AB-83) | built, not yet live |
| 07 | [Each demo has its own pack, shared by reference](step-07-demo-packs.md) | built, not yet live; the library's "unlisted" waits on a service deploy |
| 08 | [Customers and B2B](step-08-customers-b2b.md) | built, not yet live; every Bodea kind installs, `customers_export` still refused |
| 09 | [Store settings, as a layer beside a pack](step-09-store-settings.md) | to do |
| 10 | [Reset clears a demo's part of the store](step-10-wipe.md) | to do |
| 11 | [Later, when a pack needs it](step-11-later.md) | not started |
| 12 | [The storefront shows a pack's own categories](step-12-pack-categories-on-storefront.md), after 03's live run | to do |
| 13 | [Publish our packs to the Data Installer, settings split off](step-13-publish-to-data-installer.md), after 09 | to do |

Every step is test-first, reuses before it writes (the house component, hook, client or rule that
already does the job), and runs the `gate` skill before it is committed.

## Agents get every action, and every answer is lean (owner, 2026-10-28)

A step that adds a screen action names its agent tools in an **Agent surface** section, with the
three declarations each needs (`mcp-tool-authoring`): read or write, the chat's wording, and the
consent dialog when it changes something. **A step is done only when `ai-coverage-scan` shows no
new gap between what a person can do and what an agent can.**

Every new or changed tool is held to what the existing ones already are:

- **Its answer is shaped** to what an agent needs (the descriptor row's `shape`): counts and
  names, never a pack's rows or a store's raw objects.
- **It has a ceiling** in `tests/features/ai/server/responseCeilings.ts`, set from a measurement
  of the running tool (`mcp-live-probe`), and the response-size suites hold it there.
- **It is traced through a real agent:** a prompt in the evaluation battery
  (`.rptc/plans/evaluation-mode/battery/prompts.json`) declares the tool that should answer, the
  battery runs it, and the trace (`toolTraceRecorder.ts`) shows the agent reached it without
  detours, repeated reads or wasted calls.

## Security (owner, 2026-10-28)

The Data Installer service has had security tickets. Its two fixes, read from its own commits,
and where we stand:

| The service's fix | Ours |
|---|---|
| **DEMOSYS-1695:** 30 actions needed no Adobe sign-in; the gateway check (`require-adobe-auth`) was turned on | Our library's actions always ran their own guard (sign-in confirmed with IMS, then the email domain, closed when unset). The gateway check is now on for all 12 as a second lock (`accs-discovery-service` `ff2c953`; every SC is in the owning org), and library writes now name the org as reads do. **Takes effect at the next deploy, on the owner's go** |
| **DEMOSYS-1698:** Commerce secrets sent in every request were no longer accepted | Demo Builder's engine never sends them. The service engine still does; its newest code ignores them, its older code used them. **Removing them waits** for the maintainers to say caller credentials are gone for good, so that no deployment that still uses them breaks |

**Which org each action is checked against** (owner, 2026-10-28). Never a named org: each is
the org that owns the thing acted on.

| Action | Checked against | How |
|---|---|---|
| Install, dry run or remove a pack in a store (Demo Builder's engine) | The org that owns the store | `orgGuard` (`detectProjectOrgMismatch`, adobe-org-context) before anything is written, answering ORG_MISMATCH and "Switch IMS Org"; Commerce's own refusal of the project's org-bound credential behind it. On the screen, the wizard's creation install and project reset alike |
| Read or save packs in the library | The org that runs the library | Adobe's gateway (`require-adobe-auth`), the org read from the library's own address (`serviceOrgCode`), plus the library's guard |

And ours: **a pack is untrusted input.** Anyone on the team can make one, through the library or
a file. Every code a pack supplies is checked against Commerce's own rule when the pack is read,
and every value placed into a Commerce address, a file name or a log line is escaped where it is
placed. A crafted attribute code had been able to point a request at another part of Commerce;
fixed and tested.

**Every step ends with the `security-review` skill on its changes**, beside the gate and
`ai-coverage-scan`. If the maintainers name a kind of problem not covered here, it is checked
for.

## Looking and working like the rest of the extension (owner, 2026-10-27)

Nothing in this feature gets its own look. Every screen it touches already exists, and every
piece of UI it needs is already in the house vocabulary (`src/core/ui/components/CLAUDE.md`):

- **Before any file under a `ui/` directory is created**, the `reuse-first` skill runs, and the
  step's reuse table (03, 05, 07) is checked against what is actually there.
- **Extend, don't add.** The new parts are new views and rows inside surfaces that exist: the
  Data Installer screen and its import window, the pack flyout, the project dashboard's Data
  Installer tile, the wizard's Datapacks step, and the project delete confirmation.
- **A component that almost fits gets a prop**, not a sibling. A behaviour two features need moves
  to `core/ui` and its row goes in the components table.
- **No new CSS classes unless no house class fits**, and then in the feature's own stylesheet. A
  feature stylesheet only reaches the bundles whose entry imports it (ADR-017), so every class is
  checked on each surface that renders it, and any CSS change is fingerprinted before and after
  with `webview-visual-baseline`.
- **Words match the screens they sit on.** Existing labels and button names are reused
  ("Remove", "Delete", "Cancel"), and nothing on screen says capture, baseline or version.
- **Behind the screens, the same rule:** Commerce access, progress windows, job watching, agent
  tool descriptors and confirmation gates are the ones the extension already uses
  (`commerceClientForProject`, `OperationProgressModal`, `watchImportJob`, `mcp-tool-authoring`).
  After each step lands, `component-extraction-scan` and `code-duplication-scan` check nothing was
  rebuilt.

## Open questions

- Their service ran installs in background workers because of App Builder time limits; ours
  runs in the extension with no such limit, but VS Code must stay open. Is a long install
  resumable if the window closes? (Answer before step 03 ships; first answer: record per
  item, so a re-run skips what exists.)
- Which ACCS store to install into for live checks: a throwaway one is needed.
