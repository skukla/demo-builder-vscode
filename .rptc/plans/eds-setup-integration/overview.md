# Plan: EDS Setup Integration

## Status Tracking
- [ ] Planned
- [ ] In Progress
- [ ] Code Review
- [ ] Testing Review
- [ ] Complete

## Executive Summary

| Aspect | Detail |
|--------|--------|
| **Feature** | EDS setup integration |
| **Purpose** | Connect EdsProjectService to executor for EDS stack project creation |
| **Approach** | Stack-based detection using `selectedStack?.startsWith('eds-')` prefix matching |
| **Complexity** | Medium |
| **Key Risks** | Service dependency wiring, wizard config passing |

## Test Strategy

| Test Type | Coverage Goal | Framework |
|-----------|---------------|-----------|
| Unit | 80%+ | Jest |
| Integration | Critical paths | Jest |

Note: Detailed test scenarios are in each step file (step-01.md, step-02.md, step-03.md)

## Acceptance Criteria

- [ ] EDS stacks (eds-paas, eds-accs) detected via `selectedStack?.startsWith('eds-')` prefix
- [ ] EdsProjectService.setupProject() called with correct EdsProjectConfig
- [ ] Frontend cloning skipped for EDS stacks (handled by EdsProjectService internally)
- [ ] Progress reported via existing progressTracker mechanism (mapped from EdsProgressCallback)
- [ ] Non-EDS stacks unaffected (existing behavior preserved)
- [ ] All tests pass with 80%+ coverage

## Risk Assessment

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| 1 | Service dependency wiring complexity | Medium | High | Follow existing ServiceLocator pattern in HandlerContext |
| 2 | Wizard config not passed correctly | Low | High | Extend ProjectCreationConfig interface with edsConfig field |
| 3 | Progress callback integration | Low | Medium | Map EdsProgressCallback to existing progressTracker pattern |

## Implementation Constraints

- File Size: <500 lines (standard)
- Complexity: <50 lines/function, <10 cyclomatic
- Dependencies: Reuse existing patterns from executor.ts mesh phase
- Platforms: Node.js 18+ with TypeScript strict mode
- Performance: No special requirements

## Dependencies

### Required Services (Already Exist)
- AuthenticationService (via ServiceLocator/HandlerContext)
- GitHubTokenService, GitHubRepoOperations (from @/features/eds)
- DaLiveOrgOperations, DaLiveContentOperations (from @/features/eds)
- ComponentManager (already available in executor via registryManager)

### Configuration Changes
- ProjectCreationConfig interface extension with optional edsConfig field
- EdsProjectConfig mapping from wizard selections

## File Reference Map

### Existing Files to Modify
| File | Changes |
|------|---------|
| `src/features/project-creation/handlers/executor.ts` | Add EDS detection, EDS setup phase, skip frontend logic |

### Related Existing Files (Reference Only)
| File | Purpose |
|------|---------|
| `src/features/eds/services/edsProjectService.ts` | Complete EDS setup orchestration (already implemented) |
| `src/features/eds/services/types.ts` | EdsProjectConfig, EdsProgressCallback types |
| `src/features/project-creation/config/stacks.json` | Stack definitions with requiresGitHub/requiresDaLive flags |

## Step Overview

| Step | Name | Purpose |
|------|------|---------|
| 1 | Add EDS Setup Phase to Executor | Detect EDS stack, add phase placeholder, progress mapping |
| 2 | Modify Frontend Cloning for EDS | Skip frontend in componentDefinitions for EDS stacks |
| 3 | Instantiate EDS Dependencies and Pass Config | Wire services, call setupProject(), create frontend ComponentInstance |

## Architecture Notes

### EDS Detection Pattern
```typescript
// Pattern: Check selectedStack prefix (simpler than loading stacks.json flags)
const isEdsStack = typedConfig.selectedStack?.startsWith('eds-');
```

### Progress Callback Mapping
```typescript
// Map EdsProgressCallback to executor progressTracker
const edsProgressCallback: EdsProgressCallback = (phase, progress, message) => {
    progressTracker('EDS Setup', progress, message);
};
```

### Existing Patterns to Follow
- Mesh phase pattern in executor.ts (lines 206-295)
- ComponentDefinitionEntry loading pattern (lines 385-488)
- progressTracker usage throughout executor

## Next Actions

After plan approval:
1. Run `/rptc:tdd "@eds-setup-integration/"` to begin TDD implementation
2. Start with Step 1: EDS detection and phase execution

---

_Plan created by Overview Generator Sub-Agent_
_Target: 3 steps following scaffold approval_
