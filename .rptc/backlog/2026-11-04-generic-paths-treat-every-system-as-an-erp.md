---
id: AB-85
kind: fix
area: app-builder
needs: []
value: high
status: backlog
---

# Five generic paths treat every bound system as an ERP

Filed 2026-11-04 from the PL-91 audit (`.rptc/research/libraries-outside-the-extension/research.md`
§2 item 3). Owner: fix, but as planned work, not in beta.153. `value: high` because [[AB-84]]
waits on it: a contributed non-ERP row would receive ERP behaviour today.

## The sites (verified 2026-11-04)

| Site | What it does for ANY system | Kind |
|---|---|---|
| `src/features/dashboard/ui/components/integrations/integrationCardModel.ts:237` | Offers Simulate Downtime on every deployed system card | behaviour |
| `src/features/app-builder/services/appBuilderComponentTeardown.ts:98-102` | Runs the Commerce detach on every integration remove; `erpDetach.ts:61` skips only when no `detach` action is deployed | behaviour, gated by what is deployed |
| `src/features/app-builder/services/appBuilderDeploySteps.ts:285-292` | "Telling the integration about its ERPs" / "was not told about its ERPs" for any integration with listed systems | wording |
| `src/features/dashboard/ui/components/integrations/removalConsequence.ts:39-43` | "It first clears its products' ERP tags" for any system; the erp_owner lines for any linked integration | wording |
| `src/features/dashboard/ui/components/integrations/systemCardActions.ts:47-48` | A system card's Open posts `openErpScreen`; the handler's mechanism is generic (`deriveScreenUrl` on any system's `screen`) but its name and error copy say ERP | naming |

The ERP is wired into the generic surfaces by imports and by catalog flags, never by comparing
an id: `grep -rnE "['\"\`](demo-erp|erp-integration)['\"\`-]" src` finds no code site. So the gate
has to be a catalog flag too.

## The shape of the fix

One named value for the ERP system type, read where the catalog is read (`systemType: "ERP"`
already exists on the `demo-erp` row; `src/types/appBuilderComponents.ts:298`). Then:

- Downtime and the ERP-only verbs are offered only when the system's type is ERP.
- The two wording sites say "systems" or use the system's type name.
- Detach stays gated by the deployed action; its name is left alone unless [[AB-84]] needs
  a generic one.

Tests that pin the current copy and menus, to move with it:
`tests/features/dashboard/ui/components/integrations/integrationCardModel-linked.test.ts`,
`removalConsequence.test.ts`, `tests/features/app-builder/services/appBuilderComponentRunner-listSystems.test.ts`.
Add the negative case: a system whose type is not ERP gets no downtime and no ERP wording.
