# Code patterns

The **rules** live in [the handbook](../handbook.md) and are enforced by
`tests/sop/`. This file is the judgement the enforcers cannot encode: where the line
is, and what a good extraction looks like.

## Timeouts

The rule — no bare millisecond literals — is enforced by
`tests/sop/magic-timeouts.test.ts`.

Adding one:

1. Put it in `src/core/utils/timeoutConfig.ts`.
2. Name it for the operation, not the duration. `AUTH.BROWSER`, not `SIXTY_SECONDS`.
3. Comment why that value, and budget the **slow** path. Several of these bound an
   SDK attempt followed by a CLI fallback, so a value covering only the fast path
   times out work that would have finished.

**`timeoutConfig.ts` is the only list.** This file used to carry a table of the
constants alongside an instruction to keep it in sync; that is how it came to
document a `TIMEOUTS.UI_DEBOUNCE` which has never existed.

## When an expression becomes a named function

`tests/sop/complex-expressions.test.ts` catches nested ternaries and long `&&`
chains. It cannot judge the rest, so:

| Extract when | Example |
|---|---|
| Optional chaining more than 2 deep | `a?.b?.c?.d` |
| Any `Object.keys/values/entries` inline | `Object.keys(x).length > 0` |
| Boolean coercion carrying logic | `!!x && x.prop` |
| More than one array operation chained | `.filter().map()` |
| More than 2 nullish fallbacks | `a ?? b ?? c ?? d` |

The name is the point. `hasSelectedComponents(state)` says what the condition means;
`Object.keys(state.selected).length > 0` makes every reader re-derive it.

## Ternaries

Flat and simple is fine — a fallback, a two-branch assignment, a sort comparison:

```typescript
const status = installed ? 'success' : 'error';
return a.order === b.order ? 0 : a.order > b.order ? 1 : -1;
```

Nested is not, and neither is a complex test expression or a long return value. If
you are indenting a ternary across lines, it wanted an `if`.

## Inline styles

The rule is enforced by `tests/sop/inline-styles.test.ts`, which caps static inline
styles per file and pins the repo-wide totals. Styling reaches Spectrum through
`UNSAFE_className` — that is Spectrum's own API, not a workaround.

**A style object is right when the value cannot exist in a stylesheet**, because it
is computed at runtime:

```typescript
<div style={{ width: `${percentage}%` }} />
<div style={{ transform: `translateX(${offset}px)` }} />
<div style={{ backgroundColor: userSelectedColor }} />
```

Anything with a value you could have typed in advance belongs in a class. The
cascade-layer rules for where that class goes are
[ADR-018](../../architecture/adr/018-css-architecture.md).

## Related

- [god-file-decomposition.md](god-file-decomposition.md) — when a file is doing too much
- [where-code-goes.md](../../architecture/where-code-goes.md) — which KIND of thing to write, and where it lives
