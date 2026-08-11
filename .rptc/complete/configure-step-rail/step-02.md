# Step 02 — One section model

Independent of step 01. Pure logic; no UI.

## Why

Configure's sections come from three unrelated sources and only one feeds the current
nav, so the "Sections" list is not the list of sections on screen:

| Source | Where | In nav today? |
|---|---|---|
| `SERVICE_GROUP_DEFINITIONS` (8 groups), filtered by selected components | `serviceGroupTransforms.ts:74-117` → `useSelectedComponents` → `useServiceGroups` | yes |
| Hardcoded "Project" (rename) | `ConfigureScreen.tsx:642-660` | no |
| Hardcoded EDS-only "Authoring" | `ConfigureScreen.tsx:591-615` | synthetic entry, hardcoded `isComplete: true` |
| One per App Builder catalog entry | `AppBuilderComponentFieldsSection.tsx:126-154` | no |

A rail must show every section, so this has to be one list before the UI changes.

## Change

New module (suggested `ui/configure/configureSections.ts`) exporting a pure function that
returns an ordered `ConfigureSection[]`:

```ts
interface ConfigureSection {
    id: string;             // existing anchor ids: 'project-info', '<group.id>',
                            // 'authoring-experience', 'appBuilderComponent-<id>'
    label: string;
    kind: 'project' | 'serviceGroup' | 'authoring' | 'appBuilderComponent';
    isComplete: boolean;
    requiredTotal: number;
    requiredComplete: number;
}
```

Order: Project → service groups (existing `order`) → App Builder components → Authoring.
Confirm against the current screen before fixing it.

Reuse the existing completeness logic rather than reinventing it — `toNavigationSection`
(`ConfigureScreen.tsx:107-126`) already computes `isComplete`/`completedCount`/`totalCount`
from `isFieldComplete`. Move it here; do not write a second one (there are already three
copies, see step 04).

**Keep "Authoring" honest.** Today it is hardcoded `isComplete: true` with zero counts
(`ConfigureScreen.tsx:493-502`). It has a real value (a radio that is always set), so
`requiredTotal: 0` and `isComplete: true` are defensible — but state it in a comment
rather than leaving it looking like an oversight.

Then map to the rail:

```ts
steps = sections.map(s => ({
    id: s.id,
    title: s.label,
    status: s.id === activeId ? 'current' : 'done',   // all reachable, per the decision
}));
```

## Tests

New `tests/features/dashboard/ui/configure/configureSections.test.ts`:

- All four kinds appear, in the specified order
- A service group with no fields is dropped (matches `useServiceGroups.ts:91`)
- "API Mesh" absent without a mesh component (mirrors the existing `useServiceGroups` test)
- App Builder sections appear one per catalog entry
- "Authoring" appears only for EDS projects
- Completeness: required-only counting; a section with zero required is complete
- **Control**: a section with an incomplete required field is NOT complete — without it,
  "always complete" passes everything above

Reuse `ConfigureScreen.testUtils.ts` fixtures rather than inventing project shapes.
Three fixture mistakes were made in this repo on 2026-08-10 by inventing shapes instead of
reading the real ones.

## Done when

- One pure function returns every on-screen section
- No caller needs to know which of the three sources a section came from
- `gate` green
