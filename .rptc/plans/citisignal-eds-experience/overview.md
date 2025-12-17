# Implementation Plan: CitiSignal EDS Experience Deployment

## Status Tracking

- [x] Planned
- [ ] In Progress (TDD Phase)
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2025-12-17
**Last Updated:** 2025-12-17
**Steps:** 7 total steps

---

## Configuration

### Quality Gates

**Efficiency Review**: enabled
**Security Review**: enabled

---

## Executive Summary

**Feature:** Add Edge Delivery Services (EDS) frontend deployment capability for CitiSignal storefront experiences

**Purpose:** Enable Demo Builder users to create EDS-based storefronts connected to ACCS backends with automated GitHub repository creation, DA.live content management, and data ingestion via commerce-demo-ingestion tool

**Approach:** Extend existing component registry with new frontend/backend/tools options (registry-based, not hardcoded), add consolidated service layer (4 files), create 2 new wizard steps, integrate with Helix 5 Configuration Service API

**Estimated Complexity:** Complex

**Estimated Timeline:** 3-4 weeks

**Key Risks:**
- GitHub OAuth token security and storage
- DA.live API authentication with existing IMS tokens
- Helix 5 Configuration Service API integration (no fstab.yaml)

---

## Implementation Constraints

- File Size: <500 lines (standard)
- Complexity: <50 lines/function, <10 cyclomatic
- Dependencies: Reuse existing ComponentManager, CommandExecutor, AuthenticationService patterns
- Platforms: VS Code Extension (Node.js 18+, TypeScript strict mode)
- Performance: Wizard step transitions <2s, API calls with 30s timeout

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest, @testing-library/react
- **Coverage Goal:** 85% overall, 100% critical paths (OAuth, API calls)
- **Test Distribution:** Unit (70%), Integration (25%), E2E (5%)

### Test Scenarios Summary

**Happy Path:** GitHub OAuth flow completion, DA.live content creation, EDS project setup with Helix 5 config, component installation via existing patterns

**Edge Cases:** Token expiration mid-flow, partial repo creation recovery, DA.live org not accessible, concurrent wizard operations

**Error Conditions:** GitHub OAuth rejection, DA.live API failures, Helix config service errors, network timeouts, invalid ACCS credentials

**Detailed test scenarios in each step file** (step-01.md through step-07.md)

### Coverage Goals

**Overall Target:** 85%

**Component Breakdown:**
- `src/features/eds/services/githubService.ts`: 95% (OAuth + API critical)
- `src/features/eds/services/daLiveService.ts`: 90% (content operations)
- `src/features/eds/services/edsProjectService.ts`: 90% (orchestration)
- `src/features/eds/ui/steps/*`: 85% (wizard UI)

---

## Acceptance Criteria

**Definition of Done:**

- [ ] EDS frontend component selectable in wizard (eds-citisignal-storefront)
- [ ] ACCS backend component selectable in wizard (accs-backend)
- [ ] Tools category added to component registry with commerce-demo-ingestion
- [ ] Tool configuration read from registry (not hardcoded)
- [ ] GitHub OAuth flow creates repository from citisignal template
- [ ] DA.live org/site configuration via user input
- [ ] Helix 5 Configuration Service integration (no fstab.yaml)
- [ ] commerce-demo-ingestion tool cloned and executable
- [ ] Data source configuration (ACCS credentials, vertical-data selection)
- [ ] All tests passing with 85%+ coverage
- [ ] No security vulnerabilities in OAuth/token handling

**Feature-Specific Criteria:**

- [ ] Repository cloned locally after GitHub creation
- [ ] DA.live content populated from demo-system-stores accs-citisignal variation
- [ ] .env variables properly configured for EDS storefront
- [ ] Tool cleanup command available (manual cleanup pattern)

---

## Risk Assessment

### Risk 1: GitHub OAuth Token Security

- **Category:** Security
- **Likelihood:** Medium
- **Impact:** High
- **Priority:** Critical
- **Description:** OAuth tokens must be stored securely and validated properly
- **Mitigation:**
  1. Use VS Code SecretStorage API for token persistence
  2. Validate token scopes before operations
  3. Implement token refresh/re-auth flow
- **Contingency Plan:** Fall back to manual token entry if OAuth fails

### Risk 2: DA.live IMS Token Compatibility

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** High
- **Priority:** High
- **Description:** Existing IMS tokens may not work for DA.live Admin API
- **Mitigation:**
  1. Test IMS token compatibility early in implementation
  2. Reuse AuthenticationService patterns
  3. Add DA.live-specific token scope if needed
- **Contingency Plan:** Implement separate DA.live authentication if IMS fails

### Risk 3: Helix 5 Configuration Service API

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Helix 5 uses Configuration Service API instead of fstab.yaml
- **Mitigation:**
  1. Use admin.hlx.page API endpoints
  2. Reference storefront-tools implementation patterns
  3. Implement polling for Code Sync verification
- **Contingency Plan:** Document manual configuration steps as fallback

---

## Dependencies

### New Packages to Install

- [ ] **Package:** `@octokit/core@^6.0.0`
  - **Purpose:** GitHub API client for repository operations
  - **Risk:** Low (well-maintained, widely used)

- [ ] **Package:** `@octokit/plugin-retry@^7.0.0`
  - **Purpose:** Automatic retry logic for transient GitHub API failures
  - **Risk:** Low

### Configuration Changes

- [ ] **Config:** `templates/components.json`
  - **Changes:** Add eds-citisignal-storefront to frontends, accs-backend to backends, commerce-demo-ingestion to tools
  - **Environment:** All

- [ ] **Config:** `templates/wizard-steps.json`
  - **Changes:** Add data-source-config and github-dalive-setup steps
  - **Environment:** All

### External Service Integrations

- [ ] **Service:** GitHub API
  - **Purpose:** Repository creation, file operations, OAuth
  - **Setup Required:** GitHub OAuth App credentials

- [ ] **Service:** DA.live Admin API (admin.da.live)
  - **Purpose:** Content creation, organization access
  - **Setup Required:** IMS token with DA.live scope

- [ ] **Service:** Helix Configuration Service (admin.hlx.page)
  - **Purpose:** EDS site configuration
  - **Setup Required:** Same IMS authentication

---

## File Reference Map

### Existing Files (To Modify)

- `templates/components.json` - Add eds-citisignal-storefront, accs-backend, commerce-demo-ingestion (tools category)
- `templates/wizard-steps.json` - Add new step configurations
- `src/features/project-creation/ui/wizard/WizardContainer.tsx` - Register new steps

### New Files (To Create)

**Services (4 consolidated files):**
- `src/features/eds/services/githubService.ts` - OAuth + API + repo operations
- `src/features/eds/services/daLiveService.ts` - API + content + auth
- `src/features/eds/services/edsProjectService.ts` - Project setup orchestration
- `src/features/eds/services/types.ts` - TypeScript interfaces

**Wizard Steps (2 new steps):**
- `src/features/eds/ui/steps/DataSourceConfigStep.tsx` - ACCS credentials, data source
- `src/features/eds/ui/steps/GitHubDaLiveSetupStep.tsx` - Combined GitHub/DA.live setup

**Tests:**
- `tests/unit/features/eds/services/*.test.ts` - Service unit tests
- `tests/integration/features/eds/*.test.ts` - Integration tests

**Total Files:** 3 modified, ~10 created

---

## Coordination Notes

**Step Dependencies:**

- Step 2 (GitHub Service) depends on Step 1 (Component Registry)
- Step 3 (DA.live Service) depends on Step 1
- Step 4 (EDS Project Service) depends on Steps 2 + 3
- Step 6 (Wizard Steps) depends on Steps 4 + 5
- Step 7 (Integration) depends on all previous steps

**Integration Points:**

- GitHubService interfaces with VS Code SecretStorage for token persistence
- DaLiveService reuses AuthenticationService for IMS tokens
- EdsProjectService uses ComponentManager.installGitComponent() for tool cloning
- Wizard steps integrate via existing WizardContainer message handling

---

## Research References

**Research Documents:**
- `.rptc/research/eds-component-feasibility/research.md` - API feasibility assessment
- `.rptc/research/storefront-tools-eds-integration/research.md` - Reference implementation patterns
- `.rptc/research/eds-implementation-roadmap/research.md` - Phase-by-phase approach

**Key Findings:**
- DA.live Admin API supports content operations with IMS tokens
- Helix 5 uses Configuration Service (admin.hlx.page) not fstab.yaml
- GitHub OAuth popup pattern from storefront-tools is reference implementation
- commerce-demo-ingestion tool available for data population

---

## Next Actions

**After Plan Approval:**

1. **For PM:** Review and approve plan
2. **For Developer:** Execute with `/rptc:tdd "@citisignal-eds-experience/"`
3. **Quality Gates:** Efficiency Agent, Security Agent (after all steps complete)
4. **Completion:** Verify all acceptance criteria met

**First Step:** Run `/rptc:tdd "@citisignal-eds-experience/"` to begin TDD implementation

---

_Plan overview created by Master Feature Planner_
_Detailed steps in: step-01.md through step-07.md_
