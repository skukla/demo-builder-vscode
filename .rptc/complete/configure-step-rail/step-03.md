# Step 03 — Rail replaces the sidebar; one section at a time

Depends on 01 and 02. This is the visible change.

## Change

Replace `ContentWithSidebar` + `NavigationPanel` with the wizard's shell:

```jsx
<div className="configure-body">
  <div className="step-nav">
    <div className="step-nav-area">CONFIGURE</div>
    <StepRail steps={steps} activeId={activeId} onSelect={setActiveId} />
  </div>
  <div className="step-view">
    <div className="step-view-anim" key={activeId}>{activeSectionBody}</div>
  </div>
</div>
```

That shell is currently duplicated inline in three wizard step files
(`CommerceStep.tsx:294-313`, `StorefrontStep.tsx:248-256`, `IntegrationsStep.tsx:238-243`).
**This is the fourth use — extract it.** Rule of Three is satisfied twice over.

`activeId` is local `useState`, defaulting to the first section.

## The three rules that make this safe

1. **Save still submits everything.** `componentConfigs` already spans all sections; keep
   it lifted. Rendering one section must not drop another's values. Test this explicitly:
   edit section A, switch to B, save → A's change is in the payload.
2. **Validation stays global.** `canSave` walks all groups today; it must not become
   "the mounted section is valid". An error in a hidden section must still block Save —
   and the rail must show which tab holds it, or the user cannot find it.
3. **Do not create a second scroll parent.** `.container-form` is the single
   `flex:1; overflow-y:auto` scroller. `.step-view` sits inside it.

## Remove

- The `sidebar` prop and `ContentWithSidebar` usage
- `expandedNavSections`, `activeSection`, `activeField` state
- `toggleNavSection`, `navigateToField`, and the `useFieldFocusTracking` call — the whole
  `getElementById` / `scrollIntoView` / `focus()` / global-listener machinery

Keep the `section-${id}` / `field-${key}` ids for now. Nothing will scroll to them, but
they are load-bearing in four field renderers and removing them belongs in its own change.

## Open question to settle while implementing

Re-opening Configure re-sends `init` **without remounting React**
(`baseWebviewCommand.ts:197-215`), so `componentConfigs` resets while local state does not.
Decide deliberately whether `activeId` resets to the first tab on re-open, and write the
decision in a comment. Either is defensible; silence is not.

## Tests

Rework, do not delete — these assert real behaviour through a changing layout:

| Suite | Change |
|---|---|
| `ConfigureScreen-rendering.test.tsx` | Drop `navigation-panel` / `left-column` / `right-column`. Assert the rail renders a tab per section and that clicking one swaps the body |
| `ConfigureScreen-authoring-experience.test.tsx` | "Authoring" becomes a rail tab, not a nav entry |
| `ConfigureScreen-validation.test.tsx` | Drop `getElementById` / `scrollIntoView` mocks. **Add: an invalid field in a NON-active section still blocks Save** |
| `ConfigureScreen-operations.test.tsx` | Drop layout mocks. **Add: edit section A → switch to B → save includes A's change** |
| `ConfigureScreen-store-discovery.test.tsx` | "one row per field across all groups" becomes "per field in the active section" |
| `hooks/useFieldFocusTracking.test.tsx` | Delete with the hook (step 04) |

The two **Add** cases are the ones that matter — they pin the invariants a
one-section-at-a-time layout most easily breaks.

`configureHandlers.test.ts:128-130` pins the handler count at 5 and must not move: this
step changes no messages.

## Done when

- Rail renders every section; clicking swaps the body
- Cross-section save and cross-section validation both covered by tests
- Handler count still 5
- `gate` green
