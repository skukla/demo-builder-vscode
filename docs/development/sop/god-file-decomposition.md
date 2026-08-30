# God-file decomposition

The *procedure* is the [`decompose-god-file`](../../../.claude/skills/decompose-god-file/SKILL.md)
skill. This file is the two things it defers to: how to tell whether a file is
actually a god file, and the four shapes a decomposition takes.

## Is it one?

The build fails at 750 lines and eslint warns at 500. Those are a floor, not a
standard — a 400-line service can already be doing three jobs. By type:

| File type | Look at it | Act |
|---|---|---|
| Service class `.ts` | >300 | >400 |
| React component `.tsx` | >250 | >350 |
| Handler `.ts` | >350 | >500 |
| Utility `.ts` | >200 | >300 |
| Hook `.ts` | >150 | >200 |

**Length alone is not the test.** A long file doing one job is fine. It is a god
file when it is long AND shows one of these:

| Indicator | What it looks like |
|---|---|
| Multiple entity domains | `getOrgs()`, `getProjects()`, `getWorkspaces()` in one class |
| Mixed abstraction levels | fetching + validation + caching + formatting together |
| More than ~15 imports | excluding types |
| More than ~10 public methods | each group is probably a service |
| Different reasons to change | org methods change for auth, project methods for the dashboard |
| More than ~7 constructor dependencies | each one hints at a responsibility |
| The same fallback written 3+ times | an extractable pattern, not a god file yet |

The change-reason one is the most reliable and the least mechanical. If two parts of
a file are edited by unrelated features, they are two files.

## The four shapes

**A — Facade over specialised services.** For a service class covering several entity
domains. Split by *operation kind*, not by entity: fetching, resolution, selection.
The original class stays as a facade that delegates, so callers do not change.

```
adobeEntityService.ts (964 lines)
  → entityFetcher.ts     data fetching
  → contextResolver.ts   current-context resolution
  → entitySelector.ts    selection and mutation
  → adobeEntityService.ts  facade, ~150 lines
```

**B — Custom hook extraction.** For a React component holding state machines and
data-fetching alongside its markup. The logic becomes hooks; the component renders.
This is also what ADR-017 requires — hooks are the webview's service layer.

**C — Helper extraction.** For handler files. Handlers stay thin (translate, call,
return); the work moves to named helpers beside them.

**D — Repository + service layer.** When persistence and business logic are tangled
in one place.

## The one that goes wrong

Splitting by **size** rather than responsibility. Two 250-line halves of the same job
are worse than one 500-line file: now the reader needs both, and the seam between them
is arbitrary. The test is whether each piece can be described without mentioning the
other.

The skill's Gotchas section covers the rest.
