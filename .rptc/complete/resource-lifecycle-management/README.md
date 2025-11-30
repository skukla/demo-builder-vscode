# Resource Lifecycle Management Implementation Plan

## Quick Navigation

- **[Overview](./overview.md)** - Executive summary, test strategy, dependencies, acceptance criteria
- **[Step Index](./step-index.md)** - All 16 steps organized by phase with timeline

## Detailed Steps (TDD-Ready)

### Phase 2: Core Infrastructure (Week 1)
- **[Step 1: DisposableStore Utility](./step-01.md)** ⭐ DETAILED - LIFO disposal pattern
- **[Step 2: ProcessCleanup Service](./step-02.md)** ⭐ DETAILED - Event-driven process termination
- **Step 3: WorkspaceWatcherManager** - Workspace-scoped watchers (see step-index.md)
- **Step 4: Extend BaseCommand** - Add disposal support (see step-index.md)
- **Step 5: Extend BaseWebviewCommand** - Fix communicationManager disposal (see step-index.md)

### Phase 3: Incremental Migration (Weeks 2-3)
- **Step 6: Migrate extension.ts** - Workspace-scoped watchers (see step-index.md)
- **[Step 7: Migrate deleteProject.ts](./step-07.md)** ⭐ DETAILED - Dispose-before-delete pattern (**CRITICAL BUG FIX**)
- **Step 8: Migrate stopDemo.ts** - Event-driven cleanup (see step-index.md)
- **Step 9: Migrate startDemo.ts** - Process tracking (see step-index.md)
- **Step 10: Migrate stateManager** - EventEmitter cleanup (see step-index.md)
- **Step 11: Migrate componentTreeProvider** - Subscription management (see step-index.md)
- **Step 12: Fix Async .then() Patterns** - Replace with await (see step-index.md)
- **Step 13: Migrate componentUpdater** - Same deletion pattern (see step-index.md)
- **Step 14: Migrate resetAll** - Disposal coordination (see step-index.md)

### Phase 4: Testing & Documentation (Week 4)
- **Step 15: Integration Testing** - Memory leak verification (see step-index.md)
- **Step 16: Documentation** - Troubleshooting guide (see step-index.md)

## Plan Status

- **Created:** 2025-11-23
- **Status:** ✅ Ready for TDD Implementation
- **Detailed Steps Completed:** 3/16 (Steps 1, 2, 7)
- **Remaining Steps:** Brief outlines in step-index.md (to be detailed during TDD)

## Key Features of This Plan

✅ **Test-Driven:** Tests written BEFORE implementation for every step
✅ **Incremental:** One file at a time, test after each migration
✅ **Research-Based:** Addresses all 7 code smells from research document
✅ **PM-Approved:** Follows architectural principles (simplicity, LoB, no over-engineering)
✅ **Risk-Aware:** Comprehensive risk assessment with mitigations
✅ **Checkbox Format:** All tasks use `- [ ]` for TDD phase tracking

## Research Foundation

This plan is based on comprehensive research findings:
- **Research Document:** `.rptc/research/resource-lifecycle-management-vscode-extensions/research.md`
- **1232 lines** of analysis across 15+ affected files
- **7 critical code smells** identified and addressed
- **Industry best practices** from VS Code core, Remote Development extension, GitLens

## Critical Path

**Must complete in order:**
1. Steps 1-3 (Core utilities)
2. Steps 4-5 (Base class extensions)
3. Step 6 (File watcher migration)
4. **Step 7 (Highest priority - fixes ENOTEMPTY bug)** ⚠️
5. Steps 8-9 (Process cleanup)

**Steps 10-14 can be parallelized** (independent migrations)

## Estimated Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 2 | Week 1 | Core infrastructure ready |
| Phase 3 | Weeks 2-3 | All 15+ files migrated |
| Phase 4 | Week 4 | Production-ready with docs |
| **Total** | **3-4 weeks** | **Robust resource management** |

## How to Use This Plan

### Start TDD Implementation

```bash
/rptc:tdd "@resource-lifecycle-management/"
```

The TDD agent will:
1. Load the plan (overview + step files)
2. Execute each step in order (RED → GREEN → REFACTOR)
3. Run tests after each step
4. Mark checkboxes complete as work progresses
5. Trigger quality gates (Efficiency, Security) after implementation

### Update Plan During Implementation

```bash
/rptc:helper-update-plan "@resource-lifecycle-management/"
```

Use when:
- Small adjustments needed (update inline, note in Deviations Log)
- Assumptions proven wrong (document in overview.md)
- New risks discovered (add to Risk Assessment)

### Resume After Interruption

```bash
/rptc:helper-resume-plan "@resource-lifecycle-management/"
```

Provides context and shows progress.

## Success Criteria

**Phase 2 Complete:**
- [ ] DisposableStore, ProcessCleanup, WorkspaceWatcherManager implemented
- [ ] BaseCommand and BaseWebviewCommand extended
- [ ] All infrastructure tests passing (95% coverage)

**Phase 3 Complete:**
- [ ] All 15+ files migrated to new patterns
- [ ] ENOTEMPTY errors eliminated (project deletion 10/10 success)
- [ ] Orphaned processes eliminated (verified via port checks)
- [ ] All migration tests passing

**Phase 4 Complete:**
- [ ] Integration tests passing (100 iteration memory leak test)
- [ ] Documentation updated
- [ ] Manual verification completed
- [ ] Final acceptance criteria met (see overview.md)

## PM Approval Required

Before proceeding, PM must approve:
- [ ] Overall approach (DisposableStore pattern, incremental migration)
- [ ] Library installation (tree-kill, execa - ONLY if necessary)
- [ ] Breaking changes to base classes (BaseCommand, BaseWebviewCommand)
- [ ] Timeline and resource allocation (3-4 weeks)

## Contact & Support

- **Plan Author:** Master Feature Planner
- **Research Author:** Master Research Agent
- **Implementation:** TDD Agent (with PM oversight)
- **Questions:** Review overview.md or research document first

---

**Remember:** This is a living document. Update as implementation progresses.

_Last Updated: 2025-11-23_
