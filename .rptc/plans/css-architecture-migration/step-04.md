# Step 4 — sweep `!important`, per sheet

Downstream of step 3 and much smaller than it looks. **Gated on step 3** for the
sheet in question: removing an `!important` while that sheet's rules still sit
below Spectrum's re-breaks exactly what the `!important` was compensating for.

## What the 2026-09-08 measurement changed about this step

The sweep is **not** the risky part, and it is not the valuable part either.

| | elements moved |
|---|---|
| layer fix alone | 762 |
| layer fix + all 1,946 removed | 780 |

Removing 1,946 declarations moved 18 more elements. So once a sheet's cascade is
right, sweeping it is close to a no-op on screen — which is the definition of a
clean mechanical change, and the reason this step comes last rather than first.

It also means the sweep's value is **legibility, not correctness**. Nobody can
reason about a stylesheet where two thirds of declarations shout. That is worth
doing; it is not worth doing before step 3, and it is not worth arguing about.

## The finding that governs how it is done

**`!important` here is not only beating Spectrum. It is settling arguments between
our own rules.** A declaration that wins today because it is `!important` can lose
to a later or more specific rule of ours the moment it is removed — no vendor
involvement at all.

So the batch size is one SHEET, and the done condition is an empty diff for that
sheet. A cross-sheet sweep cannot attribute a moved element to the declaration
that caused it.

## Scope: layered declarations only

1,946 of the 1,965 sit inside a cascade layer; 19 do not. The 19 live in
`data-installer.css`, `connect-services.css`, `eds-steps.css` and two in the
deliberate unlayered carve-out at the bottom of `custom-spectrum.css`.

**Leave the 19 alone in this step.** An unlayered `!important` may be beating one
of OUR layered rules rather than Spectrum's, which is a different question with a
different answer. Revisit them only once their sheets have been through step 3.

## The strip must be index-based, and here is why

The first attempt walked the text with a character buffer and dropped that buffer
whenever it met a comment, silently deleting 806 lines from `custom-spectrum.css`
while reporting the correct 1,946 removals. The 5,338-line diff was unreadable and
the damage was invisible in it.

The working version finds the byte span of each `!important` to remove and deletes
exactly those spans, so the only possible edit is the intended one. It is kept at
`.rptc/plans/css-architecture-migration/strip-important.py` with its fixture.

**Its self-check is not optional**: the result must equal the original with exactly
those spans removed, line counts must not change, and a comment mentioning
`!important` must survive. Run the fixture before running the tool.

## Verification per sheet

1. capture (48 cells + interactions where the sheet has `:hover`/`:focus` rules)
2. strip one sheet, rebuild, re-capture
3. empty diff commits; non-empty reverts and the conflict is investigated
4. `importantCeiling` falls by exactly the number removed — if it falls by more,
   something ate content again

## Done when

- `importantCeiling` is at the residue that genuinely cannot go: Spectrum's own
  inline styles are the only thing a stylesheet rule cannot beat, and that number
  is not known yet — it will be whatever survives the last sheet
- ADR-018 §2 is reflected in the guidance. NOTE, checked 2026-09-08: PL-21 says
  "`docs/development/ui-patterns.md` currently teaches `!important` as the
  technique". That is stale twice over — no such file exists (it is
  `docs/development/styling-guide.md`), and that guide already states `!important`
  is NOT a mechanism. Nothing to fix here; the claim needs removing from PL-21.
- ADR-018 §2 becomes enforceable as written rather than as a ratchet
