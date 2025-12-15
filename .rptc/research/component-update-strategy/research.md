# Component Update Strategy for Multi-Project Scenarios

**Research Date:** 2025-12-09
**Scope:** Hybrid (Codebase + Web Research)
**Depth:** Standard
**Focus Areas:** User Control, Data Safety, Notification UX, Automation

---

## Summary

This research explores how the Adobe Demo Builder extension should handle component updates when a user has multiple projects. The current implementation only checks/updates the **currently active project**, leaving components in other projects potentially outdated. Industry best practices suggest multiple viable approaches depending on user control preferences and data safety priorities.

---

## Codebase Analysis

### Relevant Files

| File | Line(s) | Purpose |
|------|---------|---------|
| `src/features/updates/commands/checkUpdates.ts` | 44, 50-52 | Only checks current project |
| `src/features/updates/services/updateManager.ts` | 58-108 | `checkComponentUpdates(project)` takes single project |
| `src/features/updates/services/componentUpdater.ts` | 30-116 | Update execution with snapshot rollback |
| `src/core/state/stateManager.ts` | 122 | `getCurrentProject()` returns single project |
| `src/core/state/stateManager.ts` | 317-391 | Recent projects tracked but never auto-checked |

### Current Behavior

1. User triggers "Check for Updates" command
2. Only the **currently loaded project** is checked
3. Component updates only apply to that single project
4. Other projects remain untouched (even if using same outdated component)

### Existing Safety Mechanisms

- **Snapshot-based rollback** - Automatic on failure (lines 52-57, 89-111 in componentUpdater.ts)
- **.env smart merging** - Preserves user values (lines 293-347)
- **Concurrent update lock** - Prevents double-click (lines 42-44)
- **Structure verification** - Post-update integrity check (lines 160-196)

### Critical Gap

The system only handles ONE project at a time:
- `getCurrentProject()` returns single project
- Update check only runs on active project
- No visibility into update status of other projects

---

## Web Research: Industry Best Practices

### Key Resources

| Source | Pattern | Relevance |
|--------|---------|-----------|
| VS Code Extension Marketplace | Per-extension auto-update toggle | Direct parallel |
| npm Workspaces | Per-project versions in monorepos | Multi-project management |
| JetBrains Plugins | Notify-first, manual update default | Conservative approach |
| AWS Builders Library | Rollback safety patterns | Data safety |
| Nielsen Norman Group | Notification hierarchy | UX patterns |

### Best Practices Summary

1. **Default to notification, not auto-update** - JetBrains, VS Code patterns
2. **Badge + panel pattern** - Non-intrusive visibility (NN/g recommendation)
3. **Never surprise users** - Bloomberg's 4 guidelines for UI changes
4. **Opt-in for major versions** - Industry consensus
5. **Batch notifications** - Prevent fatigue from multiple alerts

---

## Implementation Options

### Option 1: Single Project Only (Current)

**Description:** Keep current behavior - only update the active project.

**Pros:**
- Simplest implementation (already done)
- User has explicit control over which project updates
- No risk of breaking projects user isn't actively working on

**Cons:**
- Users may forget to update other projects
- Same component can drift to different versions across projects
- Must manually switch to each project to check updates

**Best for:** Users who want maximum control, infrequent updates

---

### Option 2: Prompt Per Project (Batch Notification)

**Description:** When updates are found, show which projects have outdated components and let user select which to update.

**Flow:**
```
[Updates Available]
┌─────────────────────────────────────────┐
│ commerce-mesh v1.0.0 → v1.0.1          │
│                                         │
│ Projects using outdated version:        │
│ ☑ Project Alpha (current)              │
│ ☐ Project Beta                         │
│ ☐ Project Gamma                        │
│                                         │
│ [Update Selected] [Update All] [Later] │
└─────────────────────────────────────────┘
```

**Pros:**
- User sees full picture of what's outdated
- Can choose selective or all-at-once update
- Maintains user control
- Single notification for all projects

**Cons:**
- More complex UI to build
- Must load/scan all projects to know their versions
- Longer initial check time

**Best for:** Users with multiple projects who want informed control

---

### Option 3: Background Check, Individual Notifications

**Description:** Check all projects in background, show badge/indicator, let users update per-project.

**Flow:**
```
Status Bar: [Updates (3)] ← badge shows total

Click reveals panel:
- Project Alpha: commerce-mesh v1.0.0 → v1.0.1 [Update]
- Project Beta: citisignal-nextjs v2.0.0 → v2.1.0 [Update]
- Project Gamma: commerce-mesh v1.0.0 → v1.0.1 [Update]
```

**Pros:**
- Non-intrusive (badge pattern, per web research)
- Users can update at their own pace
- Clear visibility of update status across projects

**Cons:**
- Background checking uses resources
- Each update still requires loading that project
- No "update all" shortcut

**Best for:** Users who prefer minimal interruption, gradual updates

---

### Option 4: Auto-Update All Projects (Silent)

**Description:** When updates are found, automatically update ALL projects using that component.

**Pros:**
- All projects stay consistent
- No version drift
- User doesn't have to think about it

**Cons:**
- **Risk of breaking projects** user isn't actively working on
- May break projects with incompatible configurations
- No user control over timing
- Violates industry best practice: "Never surprise users with workflow disruption"

**Best for:** Small teams with homogeneous projects, very stable components

---

### Option 5: Leave Alone (No Multi-Project Awareness)

**Description:** Only ever update current project. Other projects only update when user opens them and explicitly checks.

**Pros:**
- Simplest mental model
- Zero risk to non-active projects
- Each project is fully isolated

**Cons:**
- Version drift accumulates silently
- Security updates may not reach all projects
- User may not realize other projects are outdated

**Best for:** Users who treat projects as completely independent

---

## Comparison Matrix

| Aspect | Option 1 | Option 2 | Option 3 | Option 4 | Option 5 |
|--------|----------|----------|----------|----------|----------|
| **User Control** | High | High | High | None | High |
| **Visibility** | Low | High | High | None | None |
| **Implementation** | Done | Medium | Complex | Medium | Done |
| **Risk to Other Projects** | None | User-controlled | User-controlled | High | None |
| **Version Drift** | Possible | Prevented | Visible | Prevented | Likely |

---

## Gap Analysis: Current vs Industry Standard

| Aspect | Current (Option 1) | Industry Standard |
|--------|-------------------|-------------------|
| **Multi-project awareness** | None | Varies (VS Code: per-extension; npm: per-project) |
| **User control** | High (single project) | High (with visibility) |
| **Version drift protection** | None | Recommended via sync tools |
| **Notification approach** | Modal dialog | Badge + panel preferred |
| **Auto-update** | No | Opt-in for minor, opt-out for major |

**Key Gap:** No visibility into update status of non-active projects.

---

## Data Safety Considerations

### Existing Protections (Already Implemented)

- Snapshot rollback on failure
- .env smart merge preserves user values
- Concurrent update lock

### Additional Considerations for Multi-Project

- Each project should have independent snapshot (don't share)
- Rollback should only affect failed project
- Consider per-project update status tracking
- Back up all .env variants (`.env.development`, `.env.production`, etc.)

---

## Common Pitfalls

1. **Auto-updating without consent** - Industry consensus: major updates should never auto-install
2. **Notification fatigue** - Batch updates into single notification rather than one per project
3. **Breaking non-active projects** - User may not notice until days later
4. **Version matrix explosion** - Components may have cross-dependencies

---

## Key Takeaways

1. **Current implementation is safe but limited** - Only updates current project, no multi-project awareness
2. **Industry prefers user control** - VS Code, JetBrains, npm all default to user-initiated updates
3. **Visibility is more valuable than automation** - Show users what's outdated, let them decide
4. **Option 2 or 3 most balanced** - Batch notification (Option 2) or badge + panel (Option 3) provide visibility without forced updates
5. **Never auto-update all projects silently** - Too risky, violates Bloomberg UX guidelines

---

## Recommended Next Steps

If proceeding with multi-project update awareness:

1. **Phase 1:** Add visibility - scan all projects on "Check for Updates", show status
2. **Phase 2:** Add batch selection UI - let users choose which projects to update
3. **Phase 3:** Add background checking with badge indicator (optional)

---

## Sources

### Official Documentation
- [VS Code Extension Marketplace](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)
- [npm Workspaces Documentation](https://docs.npmjs.com/cli/v8/using-npm/workspaces/)
- [JetBrains Managing Plugins](https://www.jetbrains.com/help/idea/managing-plugins.html)
- [Electron Auto-Update](https://www.electron.build/auto-update.html)

### UX Research
- [Nielsen Norman Group - Indicators, Validations, Notifications](https://www.nngroup.com/articles/indicators-validations-notifications/)
- [Bloomberg UX - Change Management Guidelines](https://www.bloomberg.com/ux/2019/10/18/ux-and-change-management-bloombergs-4-guidelines-for-rolling-out-ui-product-updates/)

### Industry/Engineering
- [AWS Builders Library - Ensuring Rollback Safety](https://aws.amazon.com/builders-library/ensuring-rollback-safety-during-deployments/)
- [Brad Frost - Design System Versioning](https://bradfrost.com/blog/post/design-system-versioning-single-library-or-individual-components/)
- [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

### Community
- [Dan Abramov - npm audit Broken by Design](https://overreacted.io/npm-audit-broken-by-design/)
- [npm update-notifier](https://www.npmjs.com/package/update-notifier)

---

*Research conducted as part of RPTC workflow*
