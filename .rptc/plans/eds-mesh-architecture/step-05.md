# Step 5: Integration Testing

**Purpose:** Verify the complete EDS mesh architecture separation works end-to-end.

**Prerequisites:**
- [x] Steps 1-4 completed (all routing and config generation updated)

## Tests to Write First

### Integration Tests: End-to-End Flow Verification

**File:** `tests/integration/features/mesh/meshArchitectureRouting.test.ts`

- [x] Test: EDS-PaaS stack resolves eds-commerce-mesh component
  - **Given:** Stack selection of `eds-paas`
  - **When:** ComponentManager resolves dependencies
  - **Then:** Returns `eds-commerce-mesh` with repo URL containing `eds-commerce-mesh`

- [x] Test: Headless-PaaS stack resolves headless-commerce-mesh component
  - **Given:** Stack selection of `headless-paas`
  - **When:** ComponentManager resolves dependencies
  - **Then:** Returns `headless-commerce-mesh` with repo URL containing `headless-citisignal-mesh`

- [x] Test: EDS config.json uses mesh for both commerce endpoints
  - **Given:** EDS project with deployed mesh endpoint `https://mesh.adobe.io/graphql`
  - **When:** Config.json generated
  - **Then:** Both `commerce-core-endpoint` and `commerce-endpoint` equal mesh URL

- [x] Test: Full EDS project creation includes correct mesh component
  - **Given:** Complete EDS-PaaS project creation flow
  - **When:** Project setup executes
  - **Then:** Mesh component cloned from `eds-commerce-mesh` repo

## Regression Tests

**Execution:** Run full test suite to verify no regressions

```bash
npm run test:fast        # Quick validation (3-5 min)
npm test                 # Full pretest + lint + tests
```

- [x] All existing mesh tests pass
- [x] All existing EDS tests pass
- [x] All stack routing tests pass
- [x] Coverage >= 80% maintained

## Acceptance Criteria

- [x] Integration tests verify correct mesh-per-stack routing
- [x] Config.json tests verify both endpoints use mesh
- [x] No regressions in existing test suite
- [x] Coverage target maintained

**Estimated Time:** 2 hours
