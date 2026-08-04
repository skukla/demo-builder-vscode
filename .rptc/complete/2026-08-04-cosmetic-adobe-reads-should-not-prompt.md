# Cosmetic Adobe reads should be non-interactive, not prompt

**Filed:** 2026-08-04
**Origin:** Fallout from the "browser opened mid-modal" fix
(`addIntegrationFlowHandlers` sign-in guard, same day).
**Severity:** Low — a correct prompt in a place that should not prompt at all.
**Present in:** `useWizardEffects.ts` title hydration; any future background read that
routes through a guarded entity handler.

## The gap

Adobe entity reads have two hazard levels and the codebase currently offers only two
matching answers — but they are not assigned by hazard:

| Fetch style | On a stale token | Where it is used |
|---|---|---|
| SDK-with-CLI-fallback (`getProjects`, `getWorkspaces`, `getOrganizations`) | `aio console …` opens a browser | everywhere except the on-open probes |
| SDK-only (`getOrganizationsSdkOnly`) | returns `[]`, never shells out | dashboard on-open probes (the P1 rule) |

The sign-in guard added to `addIntegrationFlowHandlers` converts the first row's
browser into an in-app pause-and-prompt. That is right for a read the user asked for —
picking a destination — and wrong for one they did not.

`useWizardEffects` hydrates a project's display title in edit mode:

```ts
webviewClient.request<…>('get-projects').then(response => { /* fill in project.title */ })
```

Nobody asked for it, nothing breaks without it, and the only visible consequence of it
failing is a project shown by name instead of title. With the guard in place, a stale
token now interrupts wizard startup with a modal sign-in prompt for that.

Strictly better than the browser it replaced, so this is a refinement, not a regression.

## Fix shape

Give the fetcher SDK-only siblings for projects and workspaces, mirroring
`getOrganizationsSdkOnly` (including its deliberate non-caching of empty results, which
exists so a failed probe cannot poison the shared cache for the real fetch). Then route
reads by whether the user asked for them:

- **User-initiated** (destination pickers, refresh, create/delete) → guarded fetch,
  pause-and-prompt. Unchanged.
- **Background/cosmetic** (title hydration, any future warm-up) → SDK-only. Degrade to
  "no data" silently; never prompt, never shell out.

A new message type (`get-projects-quiet`, or a `quiet: true` payload flag on the
existing one) keeps the guard decision on the host side rather than asking each caller
to remember. Prefer the payload flag: the flow's handler map is the single contract both
hosts spread, and a second message type would need registering in both.

## Constraints

- The P1 rule is the invariant: a read the user did not initiate must never launch a
  browser and must never stall on the CLI.
- Do not remove the guard added on 2026-08-04. This narrows what reaches it; it does not
  replace it.
- `getOrganizationsSdkOnly`'s comment explains why an empty SDK result is not cached.
  Any new SDK-only sibling inherits that reasoning — copy the behaviour, not just the
  shape.
- Cosmetic degradation must be silent in the UI but visible in the debug log; a title
  that quietly does not hydrate should still be explicable from a log dump.

## Kickoff prompt

> Add SDK-only project/workspace reads mirroring `getOrganizationsSdkOnly`, and route
> background reads (starting with `useWizardEffects`' title hydration) through them so a
> cosmetic fetch can neither prompt for sign-in nor fall back to `aio console`. Keep the
> user-initiated destination pickers on the guarded path. See
> `.rptc/backlog/2026-08-04-cosmetic-adobe-reads-should-not-prompt.md`.
