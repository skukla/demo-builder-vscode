# Step 1 — the ratchet system

The mechanism the other three steps run on. Build it first, because a migration
that can silently go backwards is not a migration.

## What a ratchet is here, and why the existing one is the right shape

`expectCeiling` in `tests/sop/architectureScan.ts` already does the hard part, and
its design is deliberate: it fails **in both directions**.

```
count > ceiling  ->  GREW_ABOVE_CEILING   the thing got worse; fix the new one
count < ceiling  ->  LOWER_THE_PIN        the thing got better; PIN IT
count = ceiling  ->  'at'                 the only passing state
```

The second arm is what makes it a ratchet rather than a limit. You cannot bank an
improvement without editing the ledger, and editing the ledger is a diff someone
reviews with a note attached. Progress becomes irreversible **and** documented, in
one mechanism.

Reuse it. Do not write a second one — this repo has already paid for that mistake
in this programme.

## The one genuinely new piece: `expectFloor`

Three of the values below must only ever RISE — they measure the instrument, not
the work. A migration verified by a net that is quietly getting coarser is worse
than no migration, and that is not hypothetical: on 2026-09-08 the fingerprint was
found blind to `letter-spacing` (so deleting a `letter-spacing` rule produced an
empty diff that proved nothing) and a capture cell rendered 6 elements where the
surface has 105, which would have compared clean against another bad cell.

```ts
/**
 * The inverse ratchet: a value that may only rise.
 *
 * For measurements of the INSTRUMENT rather than the work — captured properties,
 * fixture richness, interaction coverage. The net may get sharper and may never
 * get blunter, because a migration checked by a coarsening net is unverified and
 * looks identical to a verified one.
 */
export function expectFloor(ledger: Ledger, check: string, count: number): void {
    const floor = ledger[check] as number;
    expect(typeof floor).toBe('number');
    expect({
        check,
        count,
        verdict: count < floor ? 'FELL_BELOW_FLOOR' : count > floor ? 'RAISE_THE_PIN' : 'at',
    }).toEqual({ check, count, verdict: 'at' });
}
```

## The ledger entries

All in `tests/sop/webview-architecture-rules.exemptions.json`, beside the ones
already there. Every entry carries a `_<name>_note` saying what it measures, what
it is for, and why it last moved — the existing convention.

### Ceilings — the work, may only fall

| key | start | falls when | step |
|---|---|---|---|
| `godFileTopLevelRules` | 920 | a rule leaves `custom-spectrum.css` | 2 |
| `featureRulesInGlobalSheet` | 685 | a FEATURE-prefixed rule leaves it | 2 |
| `importantCeiling` | 1965 | an `!important` goes (exists already) | 4 |

`featureRulesInGlobalSheet` is the honest progress metric for step 2 and
`godFileTopLevelRules` is its control: if the first falls while the second does
not, rules were relabelled rather than moved.

**A rule counts as feature-family when the first class token in its selector is
not one of the utility prefixes** (`text-`, `bg-`, `border-`, `w-`, `h-`, `min-`,
`flex-`, `gap-`, `p-`, `m-`, `font-`, `items-`, `justify-`, `grid-`, `rounded-`,
`z-`, and the rest). That list lives in the test, not in prose here, so the
measurement and its definition cannot drift apart.

### Floors — the instrument, may only rise

| key | start | rises when | why |
|---|---|---|---|
| `capturedProperties` | 26 | a property joins the fingerprint | the letter-spacing blind spot |
| `interactionCells` | 168 | a surface/state pair is added | hover/focus coverage |
| `surfaceElementFloor` | per-surface map | a fixture renders more | a 6-element cell must fail |

`surfaceElementFloor` is a map rather than one number because the surfaces differ
by an order of magnitude — wizard 105, aiOverview 30 — and a single global floor
would be either useless or wrong for six of the eight.

### Step 3's metric is a floor, not a ceiling

| key | start | rises when |
|---|---|---|
| `vendorLayerBundles` | 0 of 8 | a bundle's CSS gets the vendor layer |

Step 3 makes something TRUE that is currently false, so its progress counts up.
This is also PL-33's blocked convention: "vendor CSS sits in the lowest cascade
layer" cannot be enforced while it is true of zero bundles, and becomes enforceable
the moment this reaches 8.

## What the ratchets deliberately do NOT do

**They do not judge whether a change is good.** `expectCeiling` counts; it cannot
tell a rule moved to the right sheet from a rule deleted outright. That is what the
visual baseline is for, and the two are complementary: the ratchet says the work
did not go backwards, the snapshot says the pixels did not move.

**They are not a substitute for step 3's review.** No ceiling can decide whether
`font-weight: 700 -> 400` is a regression or our intent finally applying. Counting
that element as "migrated" would be the ratchet lying.

## Also in this step

- **Amend ADR-018.** Its §§1-2 migration evidence is superseded: the 23/7 figures
  are wrong at current resolution and the "the `!important`s compensate for the
  wrapper" conclusion does not hold. The RULES stand; the migration measurement
  must be replaced with 762/780 and the reason the old numbers were smaller.
- **Pin the god file's line count** so nothing new lands in it while step 2 runs.

## Done when

- `expectFloor` exists with a control test proving it fails in both directions
- all seven ledger entries exist with notes and start at the measured values
- the suite is green at those values
- ADR-018 carries the corrected measurement
