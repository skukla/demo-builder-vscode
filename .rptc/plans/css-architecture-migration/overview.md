# CSS architecture migration — split first, flip second, and ratchet all of it

Written 2026-09-08, after PL-21 phase 4 was attempted, measured and reverted the
same day. That attempt is the reason this plan exists and the reason it is shaped
the way it is.

## START HERE — resuming cold

Nothing in this plan needs a previous conversation. Two commands recover the state:

```bash
npm run css:cycle -- --worklist   # every family left, triaged by lane
npm run css:harness               # stand up the verification harness
```

`--worklist` is the one to read: it sorts the remaining families into MOVER (the
script handles it), BY HAND (a rule inside a breakpoint, which must move whole and
in the right order) and DEAD? (no bundle renders it at all — PL-53's question, not a
move). `--next` still prints the bare size ranking.

Both read the ledger and the stylesheet rather than anyone's memory, and the reach
column comes from esbuild's own graph. The harness script does the seven
staging steps that were hand-derived on every cycle of 2026-09-08/09, and stops at
the sentinel check — which is not optional, because port 8899 is answered by an
unrelated app inside the browser container and a wrong server produces blank
captures and an empty diff for every change.

**The cycle, in full:**

1. `--next` to pick a family. Prefer one whose consumers sit in ONE feature.
2. Check bundle reach through the import graph BEFORE moving. A sheet placed where
   a consumer cannot see it renders as the style silently not applying.
3. `--move <prefix> --to <path>`. It refuses a family containing a rule inside
   `@media`/`@container`/`@supports`, and refuses an incomplete move.
4. Add the import to EVERY entry whose graph reaches a consumer.
5. `git add` the new sheet **before** gating — the `!important` ceiling reads
   `git ls-files`, so an unstaged sheet makes the count appear to fall.
6. `--verify <family> <sheet> <ref-before-the-move>` — same rules, same text, same
   layer, same order. **Do this before the visual diff, not after it.** Four of the
   six families moved on 2026-09-09 render on NO fixture surface, so their captures
   were empty for reasons unrelated to correctness; this is the check that caught
   three sheets whose commit messages said "verbatim" and were not.
7. Rebuild, re-copy bundles, re-capture, diff. **Empty commits, anything else
   reverts.** The diff's job is collateral damage — what else moved — not this
   family.
8. `--check`, then pin both counts in the ledger. The suite refuses to pass until
   you do; that refusal is the ratchet.

**Two traps that cost cycles, both now scripted or documented rather than
remembered:** a suite that names the stylesheets it expects a rule to live in will
break on a move that changes no rendering — use `tests/helpers/cssRules.ts`; and a
compound selector is NOT automatically entanglement.

`--move` sorts the mentions left behind by who OWNS the rule: one of the moved
family refuses the move, one of a DIFFERENT family that merely styles this one as a
descendant is reported and allowed. The older check refused both, which cost cycle 3
a needless joint move (brand and expandable could each have gone alone) and was
still holding 12 families on 2026-09-09 — `.intflow-*`, 52 rules, behind a single
`.manage-*` rule among them. Genuine entanglement is both sides owning rules that
name the other; `.wizard-*` + `.timeline-*` is the one such pair left.

## What the failed attempt established

The layer fix (`@layer vendor, reset, theme, overrides;` with vendor CSS wrapped)
was implemented, verified in the bundle, and measured against a 2,700-element
baseline over 48 surface/theme/width cells:

| | elements moved, of 2,700 |
|---|---|
| layer fix alone | **762 (28.2%)** |
| layer fix + all 1,946 layered `!important` removed | 780 (28.9%) |

**Both numbers contradict ADR-018**, which measured 23 and 7 respectively and
concluded the `!important`s were compensating for our own layer wrapper. They are
not. The sweep adds 18 elements to the layer fix's 762 — the layer fix causes
essentially all of the movement, and removing `!important` does not cancel it.

The old number was smaller because the old instrument was smaller: 209 elements
over 16 properties against 2,700 over 26. `line-height` alone is 528 of the
property changes and was added to the fingerprint on 2026-09-08, so it was
invisible in August by construction. ADR-018's own self-audit predicted this and
under-estimated it.

## The finding this plan is built on

**What renders today is not the design. It is the equilibrium of ~1,965
`!important` declarations arbitrating between our CSS and Spectrum's.**

762 elements is the size of the gap between what our stylesheets SAY and what the
screen SHOWS. Any change to cascade order reveals that gap. So there is no "safe
refactor" that both fixes the cascade and preserves the current appearance —
preserving the appearance means preserving the accident.

A worked example from the measurement, and a correction to how it was first
reported: `font-weight: 700 -> 400` on a button was called a regression. It is not
known to be one. In the layer-fix-only run every `!important` was still present,
so the 700 came from **Spectrum**, and one of our own rules says 400 and was
losing. After the fix our rule wins. That is very likely our intent finally
applying. Nobody can tell from the number alone, which is exactly why step 3 is a
design review and not a bug hunt.

## The idea that does not work, recorded so it is not retried

"Flip the cascade one surface at a time." There is no seam for it today:
`custom-spectrum.css` is imported by all eight bundle entries and esbuild builds
them in a single pass, so the injection plugin cannot know which bundle a sheet is
destined for.

**That is what makes the split the enabler rather than the tidy-up.** Once
`.dashboard-*` lives in a sheet only the dashboard entry imports, a cascade change
to it is scoped to one screen by construction, and step 3 becomes 180 elements at
a time instead of 762.

## The four steps

| | Step | Done when | Reviewable? |
|---|---|---|---|
| 1 | Stop the growth | the ratchets exist and hold | no review needed |
| 2 | **Split the god file by feature** | `featureRulesInGlobalSheet` at 0 | **empty diff — machine** |
| 3 | Flip the cascade, per feature sheet | `vendorLayerBundles` at 8 | **owner, per surface** |
| 4 | Sweep `!important`, per sheet | `importantCeiling` near 0 | empty diff — machine |

**Steps 1 and 2 need no decision from the owner and change no pixels.** Step 3 is
where the 762 elements arrive, in reviewable batches. Step 4 is downstream of 3
and mostly mechanical once the cascade is settled.

## Stopping after step 2 is a legitimate destination

It yields ADR-017's model — feature CSS in feature sheets, the 6,223-line file
gone, every sheet reaching only the bundles that need it — with **zero rendering
change and zero risk**. The cascade stays odd and `!important` stays, but it stops
growing and it stops being load-bearing for anyone's understanding of the code.

Steps 3 and 4 buy correctness of the cascade. They do not buy a better-looking
product. If the UI is where the owner wants it, that is a poor trade, and this
plan should stop at step 2 rather than push on out of tidiness.

## Starting values, 2026-09-08 — HISTORICAL

**These are the values the plan STARTED from, not current ones.** For current
figures run `node scripts/cssMigrationCycle.mjs --next`, which reads the ledger
and the stylesheet. Numbers copied out of a plan document are stale the moment a
cycle runs.


```
godFileLines                  6223
godFileTopLevelRules           920
featureRulesInGlobalSheet      685      <- step 2's metric
utilityRulesInGlobalSheet      235
ourSheetsInsideALayer            6 of 9
importantDeclarations         1965      <- step 4's metric
vendorLayerBundles               0 of 8 <- step 3's metric
capturedProperties              26      <- instrument floor
```

23 feature families carry 10 or more rules and cover 464 of the 685. The largest:
`.intflow-` 52, `.project-` 43, `.integration-` 35, `.dashboard-` 28,
`.prerequisite-` 25, `.sidebar-` 24, `.architecture-` 24, `.modal-` 21.

Sheet reach today: `custom-spectrum.css` 8 entries, `index.css` 7,
`vscode-theme.css` 6, `wizard.css` 4, and one entry each for `data-installer.css`,
`eds-steps.css`, `connect-services.css`.

## Steps

- [step-01.md](step-01.md) — the ratchet system
- [step-02.md](step-02.md) — split the god file
- [step-03.md](step-03.md) — flip the cascade per sheet
- [step-04.md](step-04.md) — sweep `!important`

## Related

- ADR-018 — the rules. Its migration evidence WAS superseded by the measurement
  above; corrected in the ADR on 2026-09-08, which also carries "The approach,
  settled" and the §3 amendment the owner adopted on 2026-09-09
- ADR-017 §6 — a stylesheet belongs to its bundle's graph; step 2 is what finally
  makes that true of our largest sheet
- PL-21 — the backlog item this plan serves
- PL-33 — blocked on step 3: its one unenforced convention ("vendor CSS sits in
  the lowest cascade layer") cannot be enforced until it is true
- `.claude/skills/webview-visual-baseline` — the instrument every step is verified
  by, including `capture-interactions.js` for hover/focus/active
