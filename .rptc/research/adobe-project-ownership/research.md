# Adobe I/O project ownership and deletion privileges

**Date:** 2026-08-11
**Type:** Codebase research, then resolved against live org data (see §2)
**Status:** ANSWERED — the user DID create them, under a prior IMS identity that
has since been consolidated.
**Question:** How does the extension assert ownership and deletion rights on Adobe
Console projects, and why are some projects the user created not deletable?

Prompted by an observation: "Team Meeting", "<name> and <name> Mesh" and "Demo Mesh"
(the two personal names redacted — the point is that projects get named after people)
show a delete affordance in the Adobe Demo System org; "Demo ACO" and "Solution
Led Architects Integration Service" do not — all reported as created by the same
person.

---

## 1. The rule we implement

`src/features/authentication/services/projectOwnership.ts`

```
deletable = who_created.toLowerCase() === decodeImsUserId(token).toLowerCase()
```

Both sides use the IMS `<IMS-user-GUID>@<authsrc>.e` format. **Fails closed**: no
token, undecodable token, or missing `who_created` all resolve to NOT deletable.

Nothing else is consulted — not the user's org role, not whether Adobe would in
fact permit the deletion.

### It is a real boundary, not decoration

| Layer | File | Behaviour |
|---|---|---|
| Stamp | `handlers/projectHandlers.ts:170` | Adds `deletable` to the list; the webview never receives user ids |
| Render | `ui/components/AdobeProjectPicker.tsx:161` | Trash icon only when `deletable === true` |
| Enforce | `handlers/deleteAdobeProjectHandler.ts:259` | Re-fetches `who_created` independently before acting — a crafted webview message cannot delete another user's project |

`verifyProjectOwnership` deliberately re-fetches rather than trusting the payload.
That is the actual security gate; the stamp is only UI.

### Prior art

`.rptc/research/delete-aio-project/research.md` (2026-07-03) live-probed the org
and established:

1. `who_created` is present on **every** project entry from `getProjectsForOrg`
   and `getProject`, format `<GUID>@<authsrc>.e`, alongside `who_last_modified`,
   `date_created`, `date_last_modified`. Ownership costs zero extra calls.
2. The CLI access token's JWT payload carries `user_id` in the same format, and
   the two match exactly for a project the current user created.
3. `POST /console/organizations/{orgId}/projects/{projectId}/can-delete` exists
   (undocumented in the SDK's typed surface; returned `200 {"errors":[]}`). It
   reports **blockers**, not ownership. Noted at the time; still unused.

---

## 2. RESOLVED (2026-08-11, live data)

`who_created` read for all three projects via `list_adobe_projects` after §6 #1
shipped. All present, all ending in the same `@7b4b1f61631c0ca1495ef7.e` tenant
suffix, **three distinct GUIDs**.

| Project | Deletable | `who_created` |
|---|---|---|
| Demo Mesh | yes | the user's CURRENT id (deletable ⟹ matches the token's `user_id`, by construction) |
| Demo ACO | no | the user's FORMER id |
| Solution Led Architects Integration Service | no | another former id |

**Answer: the user created all three.** Their personal Adobe ID and federated
Adobe ID were later consolidated, so projects created before the merge carry a
different IMS user GUID than the token issues today. Same human, same tenant,
different `user_id`.

Every ranked hypothesis was wrong, including the two the data appeared to
support. Reading three distinct GUIDs as three distinct people was the mistake:
identity is not stable over time, and nothing in the data says otherwise. Only
the account owner knew.

- H1 (service provisioning): wrong — `.e` is a human enterprise identity.
- H2 (another person): wrong, though it survived the data. Different GUID does
  not imply different human.
- H3 (different IMS identity): **closest**, but for the wrong reason. It predicted
  a differing `@<authsrc>` suffix; consolidation changes the USER GUID while the
  tenant suffix stays identical.
- H4 (missing field): wrong — present on all three.

**The gate behaved correctly.** This was never a defect in the rule; it was a
defect in the rule's ability to explain itself, which is §4.

The lesson for the ranking: the name of a thing was treated as evidence about its
creator. It is not. Two of the four hypotheses leaned on project names, and the
one that won leaned on none.

---

## 2b. The hypotheses, as ranked BEFORE the data (kept as a record)

Superseded by §2. Kept because the ranking was wrong in an instructive way: the
top two both reasoned from project NAMES, and the winner reasoned from none.

| # | Explanation | Confidence |
|---|---|---|
| 1 | Created on the user's behalf by a **service**, not by the user. ACO provisioning creates its Console project server-side, so `who_created` would be the provisioning identity. Fits "Demo ACO" by name. | Medium-high |
| 2 | Created by **another person** — a shared team asset the user requested rather than created. Fits "Solution Led Architects Integration Service" by name. | Medium |
| 3 | **Different IMS identity**: the `@<authsrc>.e` suffix differs if the project was created under a different identity type than the current CLI token. | Low-medium |
| 4 | `who_created` **absent** on those entries → fail closed. Prior research found it universally present, but in one org at one moment. | Low |

---

## 3. Ownership is not the same question as deletability

The gate is wrong in both directions:

- **False negative — CONFIRMED by §2, and permanent.** The user created "Demo
  ACO" under an IMS identity that was later consolidated. The gate compares one
  CURRENT `user_id` against `who_created` and has no notion of identity history,
  so every project made under a former GUID is orphaned in our UI forever — no
  re-login or org switch can repair it. Adobe Console still permits the delete,
  which is the clearest possible evidence that ownership is the wrong gate.
  Colleague-created projects are the same failure, minus the permanence.
- **False positive.** A project the user *did* create can still fail to delete.
  `consoleProjectTeardown` exists precisely to strip event registrations and
  third-party providers first, pre-empting an opaque 409. We show the trash, then
  fail.

`can-delete` answers the complement of what we check. Using both would describe
the real state: *may I* (ownership) and *can it* (blockers).

---

## 4. The UI cannot explain itself

A missing icon carries no reason. The user's question is the evidence: from the
screen there is no way to learn why two projects differ.

`who_created` used to be fetched on every list and discarded before it could
reach anyone — `list_adobe_projects`' `lean()` kept only `id`, `name`, `title`.
FIXED (§6 #1): the field now travels, which is what resolved §2. The PICKER still
explains nothing, so §6 #2 stands.

---

## 5. Incidental finding: a literal that does nothing

`adobeEntityFetcher.ts:908` sends `who_created: 'Demo Builder'` when creating a
project via `createFireflyProject`.

Since Demo Builder-created projects **are** deletable by their creator, Adobe must
overwrite this with the authenticated user's IMS id. The literal is therefore dead
weight — and a latent hazard: were Adobe ever to honour it, every project the
extension creates would become permanently undeletable by anyone, since
`'Demo Builder'` can never equal a `<GUID>@<authsrc>.e` string.

Inferred from the user's observation, not confirmed against the API. The two other
occurrences (lines 982, 1137) are **workspace** creation and do not affect project
ownership.

---

## 6. Recommendations

| # | Action | Confidence | Size |
|---|---|---|---|
| 1 | ~~Add `who_created` to `lean()` so the value is readable~~ **DONE** — answered §2 within minutes | High | 2 lines |
| 2 | ~~Per-row hint on non-deletable rows~~ **BUILT, THEN REVERTED 2026-08-11.** See §8 — it does not survive real list sizes | Rejected | — |
| 3 | Call `can-delete` on press; report blockers instead of an opaque failure. PARKED. Note it only ever makes the extension MORE cautious — it reports blockers on projects you already own and never grants deletion — so it stays compatible with the #4 decision if revisited | Medium (endpoint undocumented) | Medium |
| 4 | ~~Decide the policy: gate on ownership, or on what Adobe permits?~~ **DECIDED 2026-08-11: keep the ownership gate.** Deliberately cautious about deletion; do not widen | Settled | — |
| 5 | Remove the `who_created: 'Demo Builder'` literal, or send the token's user id | Medium | ~1 line |

**#1 shipped and did its job.** #2 is now the highest-value remaining item: the
whole investigation existed because a missing icon could not say "someone else
made this".

**#4 is settled: the gate stays.** The argument for widening was real — IMS
consolidation permanently orphans a user's own projects, and Adobe Console
disagrees with our verdict — but deletion is the wrong place to trade safety for
convenience. Accepted consequence: projects created under a former identity are
undeletable in the extension forever, and the Adobe Developer Console is the
supported way to remove them.

#2 was built and reverted (§8). Nothing remains that is worth doing: the gate is
correct, the decision is to keep it, and the explanation is not worth its cost at
the scale the picker actually runs at.

Remaining: #3 (parked) and #5 (cosmetic, fold into the next edit of that file).

---

## 7. Method and limits

Direct code investigation: `projectOwnership.ts`, `imsTokenClaims.ts`,
`adobeEntityFetcher.ts`, `adobeEntityMapper.ts`, `deleteAdobeProjectHandler.ts`,
`projectHandlers.ts`, `AdobeProjectPicker.tsx`, `adobeTools.ts`, plus the
2026-07-03 delete-aio-project research.

Then resolved with live data: `list_adobe_projects` against the Adobe Demo System
org once §6 #1 exposed `who_created` (§2).

**Still not probed:** the `can-delete` endpoint (§3) and whether Adobe overwrites
the `who_created` we send on create (§5) — the latter is inferred from the fact
that Demo Builder-created projects are deletable by their creator.

---

## 8. Recommendation #2 was built and reverted

A muted `InfoOutline` in the row's trailing slot, `aria-label` + `title` =
"Created by a different Adobe account". Shipped, seen in the Dev Host, reverted
the same day. Two problems, the second fatal.

**Placement.** Spectrum's `<Item>` slots an icon-bearing child into the ICON
position — the START of the row — so the hint landed before the selection
checkbox and collided with it. The trash button escapes this because
`ActionButton` slots differently. Fixable.

**Scale, which is not fixable.** The picker showed **723 projects** in the Adobe
Demo System org, of which the user owns a handful. The hint marked the ~717
non-deletable rows to explain the ~6 deletable ones: it annotated the RULE and
left the EXCEPTION unmarked. The trash icon was already the signal; adding an
icon to everything else buried it.

The reporting user's reaction — "Should I be seeing anything here?" — is the
finding. A glyph repeated 717 times explains nothing.

`SelectionStepContent` already has a precedent for this
(`disabledReasons` → row description, "the account-switch hint"), and it fails
the same way here: a second line on nearly every row of a 723-item list.

**Decision: no explanation in the picker at all.** The gate is correct, deletion
is safe, and the trash icon on owned rows is self-explanatory. A single line of
copy near the list was offered as an alternative and declined — the absence needs
no narration.

**The transferable lesson:** the recommendation assumed a short list where a
missing affordance would be conspicuous. It was written from code, without ever
seeing the surface populated. Check the cardinality of a list before designing
per-row anything.
