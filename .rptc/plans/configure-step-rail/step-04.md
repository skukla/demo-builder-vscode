# Step 04 — Delete what the rail makes dead

Depends on 03. Deletion only — no behaviour change.

Per the repo's "no soft deprecation" rule: delete, do not stub.

## Verified dead (Phase 1, two agents independently)

**Five hooks** in `src/features/dashboard/ui/configure/hooks/`, exported from a barrel
nothing imports (`ConfigureScreen` imports the three live hooks by direct path):

- `useConfigureNavigation`, `useConfigureActions`, `useConfigureFields`,
  `useFieldValidation`, `useSmartFieldFocusScroll`

Four have tests (~800 lines). Delete the tests with them — a test for deleted code is
not coverage.

**Made dead by step 03:**
- `useFieldFocusTracking` + its test
- `NavigationPanel` — Configure was its only live consumer. **Check before deleting**:
  `ConfigNavigationPanel` (0 consumers) and `useConfigNavigation` (0 consumers, has a
  test) also appear dead. If all three go, so do the four `NavigationPanel-*.test.tsx`
  suites (~486 lines in one).

**Duplication:**
- `toNavigationSection` exists three times — inline in `ConfigureScreen.tsx:107-126`,
  in `configureHelpers.tsx:45-64`, and as a genuine variant in `ConfigNavigationPanel.tsx:33`
  (it takes an extra argument). Step 02 leaves one. Delete the other two, keeping the
  variant only if `ConfigNavigationPanel` survives.
- `ConfigureScreen.tsx:672-701` hand-rolls `ServiceGroupList`. That component's own
  docstring records this same duplication being fixed once already, elsewhere. Use the
  component.

## Method

**Do not delete on the strength of this list.** The `dead-code-scan` skill's rule applies:
run a control first. For each symbol, grep for real references with a positive control
proving the grep can find one, and check `git log -S` for why it landed.

Closed reference loops are the specific hazard here — five hooks exported from one barrel
can reference each other and look alive.

## Done when

- `bash .claude/skills/dead-code-scan/scan.sh src` shows no new orphans
- `ConfigureScreen.tsx` is well under the 350-line component limit
- Full suite green (deletions must not silently drop coverage of live code)
- `gate` green
