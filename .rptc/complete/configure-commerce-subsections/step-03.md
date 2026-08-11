# Step 03 — DROPPED (2026-08-11): the premise did not survive checking

Kept as a record. Do not implement.

## What it proposed

Merge the **Adobe Assets** and **Authoring** tabs into one **Storefront** tab. Three
reasons were given:

1. Two adjacent tabs holding one control each.
2. They are one concern.
3. `AEM_ASSETS_ENABLED` needs the AEM `repositoryId` from VS Code settings, and the only
   pointer to Extension Settings sits in the **Authoring** tab's footer — the prerequisite
   for one tab's field is a link in the other.

## Why it was dropped

**Reason 3 is false, and it was the load-bearing one.** Verified:

- No file in `src/` references both `AEM_ASSETS_ENABLED` and `aemAuthorUrl` /
  `repositoryId`. Zero.
- `AEM_ASSETS_ENABLED` is consumed in one place — `configGenerator.ts:317,526` — as a
  boolean flag written into the storefront `config.json`. It is also on the storefront
  staleness watch list and read once by ReviewStep. That is all.
- Its registry description names the dependency explicitly, and it is not a VS Code
  setting: *"Disable if your Commerce backend does not have AEM Assets integration
  configured."*
- `demoBuilder.daLive.aemAuthorUrl` → `aem.repositoryId` (`edsHelpers.ts:838`) is written
  into the per-site DA.live config so da.live's Library can find AEM Assets. That is a
  DA.live authoring concern, which is exactly what the Authoring footer link says it is.

**Reason 2 does not hold on inspection either.** "Should product images come from AEM
Assets" is a storefront data-source flag. "Which tool do I author content in" is a tooling
choice. They are both AEM-adjacent, which is not the same as being one concern.

**Reason 1 alone is not enough.** Two single-control tabs are worth merging when they are
the same task. Merging them under an invented noun because each is small trades a clear
label for a vague one.

## What the research got wrong, and how

`research.md` §2f recorded reason 3 as a finding. It is an inference from two facts that
are individually true — the assets field is EDS-only, and the settings link is on the
Authoring tab — joined by an assumption that was never checked against the code. The
research doc's own confidence note flags this class of finding as code-derived rather than
observed; this is the one that did not survive.

Corrected in `research.md` rather than deleted, so the same merge is not re-proposed.

## If the merge is ever revisited

It would be on presentation grounds only — a rail where no tab holds fewer than two
controls — and it would need a label that reads correctly on **headless**, where there is
no Authoring control at all and the tab would hold one optional assets URL. That was the
open question when this step was dropped, and dropping it moots the question.

## Consequence for the plan

The tab targets shrink. Without this step:

| Shape | Today | After steps 01–02 | With step 04 |
|---|---|---|---|
| EDS + ACCS | 5 tabs | 4 | 4 (Commerce gains sub-sections) |
| EDS + PaaS | 6 tabs | 5 | 5 (same) |

Step 04 remains the only substantive step left, and it is about structure inside the
Commerce tab rather than tab count.
