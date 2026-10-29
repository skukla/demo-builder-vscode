---
id: AB-51
kind: feature
area: app-builder
needs: []
value: med
status: built
parent: AB-16
---

# An ERP's list id is named for the ERP, not `erp` or a component id

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-09-30. Owner, reading Bodea's products: "I'm trying to understand why ERP owner
is set to ERP rather than the id or name of the owning ERP."

## What is wrong

A product's `erp_owner` holds the id the integration's ERP list knows the owning ERP by. The
integration's own ERP has the literal id `erp` (`SINGLE_ERP_ID`, from before several ERPs
existed: "an install with one ERP keeps working exactly as before"), and an ERP added later
has its Demo Builder component id (`demo-erp-2`). So Northwind is `erp` and Contoso is
`demo-erp-2`: two kinds of id, and neither names the ERP. The JustRite picture (deck slide 24,
"owner: Cabinet ERP") says the value names the system. The same id is on every key-map row,
every ERP event, the ledger, and the Admin page's ERP switcher.

## Design

**What the id is.** A listed system's id in its integration's list (`listId`) is derived from
the ERP's name when the system is added — lower-case, a trailing "ERP" word dropped, runs of
anything but letters and digits as one hyphen, unique among the project's systems (numbered
`-2`, `-3` when taken) — and never rewritten: `Northwind ERP` → `northwind`, `Contoso ERP` →
`contoso`. A rename moves the label and leaves the id alone, exactly as `commerceAppId` does.

**Where it lives.** `AppBuilderComponentState.listId`, written by the runner before the
first deploy reads the inputs (`ensureListId`, the `ensureCommerceAppId` pattern) and carried
through the transient "deploying" record. `listIdOf(project, entry)` answers the record, else
the same derivation from the recorded name, so reads before the first deploy agree with it.

**What goes.** The catalog's `listedAs.firstId` (type, schema, json): no system has a special
id any more. "The integration's own system" — the one that shares its workspace and answers
its credential — is still a fact, but it is the pairing (`entry.id === catalogId`, or the
numbered integration exists), now `broughtByItsIntegration`, not an id comparison.
`mergeKeyMap` stops treating a row that names no ERP as the first ERP's: the fill always
names the ERP, so such a row belongs to no listed ERP and is left alone.

**The integration** needs no code change: `SINGLE_ERP_ID` remains the id of the one entry an
install with NO stored list serves (the pair-in-a-box tests), and `eventErpId` already
answers null for an event naming no ERP once no listed ERP is `erp`. Its docs said the first
ERP is `erp`; they say this instead.

**The mock ERP** picked its starting look from a trailing number in its id; with named ids it
picks from a hash of the id, so two fresh ERPs still look different.

**Alternatives.** Keep `erp` and rename in the Admin page only — hides the id where the SC
reads it and leaves it on every product. Use the component id for every ERP (`demo-erp`,
`demo-erp-2`) — one kind of id, but a Demo Builder id, meaningless to a reviewer who knows
the deck. Named ids cost one field and one migration and read right everywhere.

**Bodea.** Its two ERPs get their ids on their next deploy; the stored list, the key map and
the six owned products then move with a reset + redeploy + load (AB-52).

## Shipped so far
- 2026-09-30  Built 2026-09-30 on loop/2026-09-30-erp-programme: erpListId.ts (erpListIdFor, listIdOf, ensureListId, broughtByItsIntegration), listId on AppBuilderComponentState + manifest schema, catalog firstId removed (json/schema/type), runner records the id before the first deploy and carries it through the deploying record, mergeKeyMap drops the first-ERP fallback, set_erp_settings answers the ERP row. demo-erp a509b04: theme from a hash of a named id. 305 suites + demo-erp 402 green; tsc, typecheck:tests, lint clean. Not yet live: Bodea's ERPs still carry erp / demo-erp-2 until reset + redeploy (AB-52 step 4).
- 2026-09-30  Also: the runner sends the integration its ERP list after any deploy that changes it (an integration that lists systems; a listed system's redeploy). Found while porting — a first pair never sent the list; the standalone id erp happened to match. Test: appBuilderComponentRunner-listSystems.test.ts.
- 2026-10-01  Proven live 2026-10-01 on the justrite project: get_erp_status lists the two ERPs with listId justrite and accuform; the integration's list is [justrite, accuform]; products carry erp_owner=justrite (43) and erp_owner=accuform (96). Built; ships with the ERP branch.
- 2026-10-03  Reconciled 2026-10-03 (second pass): the ERP half (demo-erp a509b04, a theme chosen from a named ERP id) is not on ERP main: main's theme code reads only numbered ids, so justrite and accuform both start with the default theme. To land.
- 2026-10-03  ERP half landed on ERP main 2026-10-03 (3d62b41, the a509b04 change). Measured: justrite and accuform both hash to foundry, so a hash alone cannot keep two ERPs apart; Demo Builder now gives an added ERP a theme no other ERP uses (in progress on loop/2026-10-03-erp-themes).
- 2026-10-03  feat(erp): an added ERP gets a theme no other ERP in the project uses (AB-51) (`0faf8a5e8`)
