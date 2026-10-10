# A project with no storefront (AB-1b) — design, parked on three owner decisions

Backlog item: `.rptc/backlog/2026-06-17-appbuilder-app-only-project.md`. Research and design
by the 2026-10-05 night loop. No code changed: every remaining step depends on a choice
below that changes what the SC sees, and none of them has an established pattern to extend.

## Staleness check (2026-10-05)

The item's three live blockers still hold; the fourth is still dead.

- `stacks.schema.json:74` still lists `frontend` in `required`; `src/types/stacks.ts:42`
  still types it `frontend: string`. All four stacks in `stacks.json` have a frontend.
- The executor already tolerates no frontend: `executorComponentLoading.ts` adds it only
  when present (read 2026-10-05).
- Wizard: the stack is not picked directly. The SC picks a demo package on Welcome; the
  Commerce area's Backend step resolves the stack from the backend among the package's
  storefront keys (`commerceSections.ts`, `allowedStackIds` + `resolveStackForBackend`).
  There is no "no storefront" choice anywhere today.
- The env sink: `regenerateProjectEnvFiles` (`envFileRegeneration.ts`) writes a `.env` per
  installed component with a path, so with no frontend it writes nothing and does not fail.
  The deployed values are kept on `appBuilderComponents[id].providesEnvVars` and today only
  the EDS `config.json` reads them.

**Measured, not guessed:** making `Stack.frontend` optional breaks 10 sites in `src/` and 10
in `tests/` under `tsc` (2026-10-05, change reverted): `stackHelpers.ts` (4),
`blockLibraryLoader.ts` (2), `brandStackLoader.ts`, `IntegrationsStep.tsx`, `tileStatus.ts`,
`useProjectBuilder.ts`. The type change itself is small. Two runtime places tsc cannot see
need a guard too: `startDemo.ts` takes `frontendComponent?.port || defaultPort` and would
start "the demo" on port 3000 with nothing to run; the dashboard's Start/Stop and Open
buttons would need to disappear for such a project.

## Design

**What entity is this.** A *stack* without a frontend: `{ backend, frontend: absent }`. Not a
new entity. Stacks are already "the frontend+backend combination the SC picks", and the
creation path, the integrations catalog's axis filters (`?? ''`) and the storefront area's
visibility (`stackRequiresAny`) already key off the stack.

**What owns it.** `stacks.json` (two new rows, `app-only-paas` / `app-only-accs`, or one per
backend), its schema and type (the three places a config field lives). A demo package opts
in by listing the stack id under `storefronts` — and that is where the model strains: the key
is literally "storefronts", and its value is a storefront definition.

**Alternatives.**
- *A "No storefront" choice in the Storefront area.* The area is EDS-only and hidden for
  other stacks, and the stack has already been resolved by the time it shows, so choosing
  "none" there would rewrite a decision made one area earlier.
- *A demo package with `storefronts: {}`.* Schema-legal today, but then the package allows no
  stack at all and every Backend card is disabled; it would need a special rule ("empty means
  any backend, no frontend"), which overloads a field that carries brand data.

## Decisions for the owner (walkthrough queue)

1. **Where does the SC say "no storefront"?** Recommendation: a third frontend option on the
   Commerce area's Backend step ("No storefront — Commerce and integrations only") that
   resolves to the app-only stack for the chosen backend. It is the one place the stack is
   already resolved, so nothing downstream changes order. The alternative is a card on the
   Welcome step (a "Commerce only" demo package), which is simpler but ties the choice to a
   brand.
2. **Where do the app's addresses go with no storefront to read them?** Recommendation: no
   file — show `providesEnvVars` (the mesh endpoint, app URLs) on the integrations screen,
   where the SC already looks, and expose them through `get_project` for agents. A
   project-level `.env` would be a file nothing reads.
3. **Does such a project need an App Builder–entitled org?** Carried over from the item and
   still unanswered. Recommendation: yes — a project with no storefront exists only to hold
   App Builder apps, so the entitlement check is the point, not a cost.

## Once decided — the slices (all unattended-executable)

1. `Stack.frontend` optional + schema + the 10 tsc sites (ask-the-tool: change the type, fix
   what tsc names, run the suite).
2. The app-only stack rows and the Backend-step option; `filterStepsForStack` already hides
   the storefront area.
3. The dashboard: no Start/Stop/Open for a frontend-less project; `startDemo` refuses cleanly.
4. The addresses' display (decision 2).
5. A creation test with backend + one integration and no frontend; the regenerate path
   (Regenerate AI Files) must produce the same bundle as creation.
