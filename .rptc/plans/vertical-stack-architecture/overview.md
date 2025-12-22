# Implementation Plan: Vertical + Stack Architecture

## Status Tracking

- [x] Planned
- [ ] In Progress (TDD Phase)
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2025-12-17
**Last Updated:** 2025-12-18
**Steps:** 11 total steps (Phase 1: 3, Phase 2: 8)

---

## Configuration

### Quality Gates

**Efficiency Review**: enabled
**Security Review**: enabled

---

## Executive Summary

**Feature:** Redesign template selection to separate **Brand** (content/vertical) from **Stack** (frontend + backend architecture), then implement Edge Delivery Services (EDS) as a new stack option.

**Purpose:**
1. Enable flexible combination of brands and stacks without template explosion
2. Add EDS + ACCS as a deployment option alongside existing NextJS + PaaS
3. Provide clear, educational UX that teaches users the distinction

**Approach:** Two-phase implementation:
- **Phase 1** (Steps 1-3): Data model + UI architecture for brand/stack selection
- **Phase 2** (Steps 4-11): EDS-specific services, wizard steps, and lifecycle management

**Estimated Complexity:** Complex (multi-phase)

**Key Decisions:**
- Template selection becomes two explicit choices: Brand + Stack
- Component selection is derived from stack (not manual)
- Wizard steps are conditionally shown based on stack requirements

---

## The Core Insight

Instead of creating N templates for every brand × stack combination:

```
Before: Templates (combinatorial explosion)
├── citisignal-headless
├── citisignal-eds
├── default-headless
├── default-eds
├── buildright-headless
└── buildright-eds
    ... (6+ templates and growing)
```

We separate the two dimensions:

```
After: Brands × Stacks (additive, not multiplicative)

Brands (3):           Stacks (2):
├── Default           ├── Headless (NextJS + PaaS + Mesh)
├── CitiSignal        └── Edge Delivery (EDS + ACCS)
└── BuildRight

User picks one from each column → that's their project configuration
```

---

## Implementation Phases

### Phase 1: Template Architecture (Steps 1-3)

| Step | Name | Description | Complexity |
|------|------|-------------|------------|
| 1 | Data Model | Create brands.json, stacks.json, TypeScript interfaces | Simple |
| 2 | Welcome Step UI | Two-choice selection: Brand cards + Stack cards | Medium |
| 3 | Component Wiring | Derive components from stack, apply brand defaults, filter steps | Medium |

**Phase 1 Outcome:** Users can select Brand + Stack, wizard adapts accordingly

### Phase 2: EDS Implementation (Steps 4-11)

| Step | Name | Description | Complexity |
|------|------|-------------|------------|
| 4 | Component Registry | Add eds-storefront, enhance adobe-commerce-accs | Simple |
| 5 | GitHub Service | OAuth, repository creation, file operations | Complex |
| 6 | DA.live Service | Content management, organization access | Complex |
| 7 | EDS Project Service | Orchestration of GitHub + DA.live + Helix | Complex |
| 8 | Tool Integration | commerce-demo-ingestion for data population | Medium |
| 9 | Wizard Steps | GitHub Setup, DA.live Setup UI components | Medium |
| 10 | Integration & Polish | End-to-end testing, error handling | Medium |
| 11 | Lifecycle Management | Project cleanup/deletion with external resource removal | Medium |

**Phase 2 Outcome:** EDS stack fully functional with GitHub/DA.live integration and proper cleanup on deletion

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

**Phase 1 Tests:**
- Brand/Stack JSON validation
- Component derivation from stack selection
- Brand config defaults application
- Step filtering based on stack requirements

**Phase 2 Tests:**
- GitHub OAuth flow completion
- DA.live content creation
- EDS project setup with Helix config
- Component installation via existing patterns

**Detailed test scenarios in each step file** (step-01.md through step-10.md)

---

## Acceptance Criteria

### Phase 1: Architecture

- [ ] brands.json with at least 2 brands (Default, CitiSignal)
- [ ] stacks.json with at least 2 stacks (Headless, Edge Delivery)
- [ ] Welcome step shows Brand + Stack selection UI
- [ ] Selecting stack auto-derives component selection
- [ ] Selecting brand auto-applies config defaults (store codes)
- [ ] Wizard steps filtered based on stack requirements

### Phase 2: EDS Implementation

- [ ] eds-storefront component selectable via Edge Delivery stack
- [ ] adobe-commerce-accs backend enhanced for EDS
- [ ] GitHub OAuth flow creates repository from template
- [ ] DA.live content copied based on brand selection
- [ ] Helix 5 Configuration Service integration
- [ ] commerce-demo-ingestion tool available for data population
- [ ] All tests passing with 85%+ coverage
- [ ] No security vulnerabilities in OAuth/token handling

### Phase 2: Lifecycle Management

- [ ] EDS metadata stored in project manifest (githubRepo, daLiveOrg, daLiveSite, backendType)
- [ ] Delete confirmation shows EDS-specific external resources (including backend data)
- [ ] User can choose which resources to delete/preserve
- [ ] Backend data cleaned up via commerce-demo-ingestion (Commerce or ACO)
- [ ] GitHub repo can be deleted or archived (archive as safer default)
- [ ] DA.live content removed via Admin API
- [ ] Helix site unpublished via Admin API
- [ ] Cleanup order enforced: Backend → Helix → DA.live → GitHub
- [ ] Cleanup continues even if one service fails (partial failure resilience)
- [ ] Clear error messages for permission issues with manual fallback links

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

### Risk 3: UX Complexity with Two Choices

- **Category:** UX
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Two-choice UI might confuse users expecting single template selection
- **Mitigation:**
  1. Clear visual design with section headers
  2. Tooltips explaining brand vs stack
  3. Smart defaults (featured brand, recommended stack)
- **Contingency Plan:** Add "Quick Start" presets for common combinations

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

- [ ] **Config:** `templates/brands.json` (NEW)
  - **Changes:** Brand definitions with content sources and config defaults

- [ ] **Config:** `templates/stacks.json` (NEW)
  - **Changes:** Stack definitions with component mappings

- [ ] **Config:** `templates/components.json`
  - **Changes:** Add eds-storefront, enhance adobe-commerce-accs

- [ ] **Config:** `templates/wizard-steps.json`
  - **Changes:** Add conditional step visibility based on stack

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

### Phase 1 Files

**New Files:**
- `templates/brands.json` - Brand definitions
- `templates/stacks.json` - Stack definitions
- `templates/brands.schema.json` - JSON schema
- `templates/stacks.schema.json` - JSON schema
- `src/types/brands.ts` - TypeScript interfaces
- `src/types/stacks.ts` - TypeScript interfaces
- `src/features/project-creation/ui/components/BrandSelector.tsx`
- `src/features/project-creation/ui/components/StackSelector.tsx`
- `src/features/project-creation/ui/helpers/stackHelpers.ts`
- `src/features/project-creation/ui/helpers/brandDefaults.ts`
- `src/features/project-creation/ui/wizard/stepFiltering.ts`

**Modified Files:**
- `src/features/project-creation/ui/steps/WelcomeStep.tsx` - Major redesign
- `src/types/webview.ts` - Add selectedBrand, selectedStack
- `templates/wizard-steps.json` - Add conditional visibility

### Phase 2 Files

**New Files:**
- `src/features/eds/services/githubService.ts` - OAuth + API + repo operations
- `src/features/eds/services/daLiveService.ts` - API + content + auth
- `src/features/eds/services/edsProjectService.ts` - Project setup orchestration
- `src/features/eds/services/types.ts` - TypeScript interfaces
- `src/features/eds/ui/steps/GitHubSetupStep.tsx` - GitHub OAuth wizard step
- `src/features/eds/ui/steps/DaLiveSetupStep.tsx` - DA.live config wizard step

**Modified Files:**
- `templates/components.json` - Add eds-storefront component
- `src/features/dashboard/handlers/dashboardHandlers.ts` - Add EDS cleanup to delete handler
- `src/types/project.ts` - Add EdsMetadata interface

**Total Files:** ~22 new, ~10 modified

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
- storefront-tools uses Default and CitiSignal variations for content sources

---

## Next Actions

**After Plan Approval:**

1. **For PM:** Review and approve plan
2. **For Developer:** Execute with `/rptc:tdd "@vertical-stack-architecture/"`
3. **Phase 1 First:** Complete steps 1-3 before starting Phase 2
4. **Quality Gates:** Efficiency Agent, Security Agent (after all steps complete)
5. **Completion:** Verify all acceptance criteria met

**Recommended Execution Order:**
1. Step 1 (Data Model) - Foundation
2. Step 2 (Welcome UI) - User-facing first
3. Step 3 (Wiring) - Complete Phase 1
4. Steps 4-10 (EDS) - Phase 2 implementation
5. Step 11 (Lifecycle) - Cleanup after all creation paths work

---

_Plan overview created by Master Feature Planner_
_Updated 2025-12-18 to separate Brand + Stack architecture_
_Updated 2025-12-18 to add Step 11 (Lifecycle Management) for proper cleanup/deletion_
_Detailed steps in: step-01.md through step-11.md_
