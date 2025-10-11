# Architecture Documentation Index

## Quick Start

**New to the codebase?** → Start with [`overview.md`](overview.md)  
**Need Adobe integration details?** → See [`adobe-setup.md`](adobe-setup.md)  
**Want to understand components?** → Read [`component-system.md`](component-system.md)

## Documents Overview

### [`overview.md`](overview.md) - **START HERE**
**Purpose**: High-level system architecture and technology stack

**When to Read**:
- First time exploring the codebase
- Need to understand overall system design
- Want to know key design decisions
- Looking for technology stack information

**Topics Covered**:
- High-level architecture diagram
- Technology stack (Extension, UI, Integrations)
- Key components (Wizard, State Management, Auto-Update, etc.)
- Design decisions and rationale
- Development workflow
- File organization
- Security considerations

**Reading Time**: 15-20 minutes

---

### [`adobe-setup.md`](adobe-setup.md)
**Purpose**: Deep dive into Adobe authentication and configuration flow

**When to Read**:
- Implementing or modifying Adobe authentication
- Debugging org/project/workspace selection issues
- Understanding the two-column layout pattern
- Working on the wizard's Adobe Setup step

**Topics Covered**:
- Two-column layout design philosophy
- Progressive disclosure pattern
- State flow (authentication → projects → workspaces)
- Message protocol for Adobe operations
- Fast polling optimization (1-second intervals)
- Edit capabilities and summary panel

**Reading Time**: 10-15 minutes

**Prerequisites**: Basic understanding of React and VS Code webviews

---

### [`component-system.md`](component-system.md)
**Purpose**: Component-based architecture for demos

**When to Read**:
- Adding new components to the registry
- Implementing component installation or updates
- Understanding component dependencies
- Working with component lifecycle

**Topics Covered**:
- Component types (Frontend, Backend, Dependencies, etc.)
- Component registry structure
- Dependency resolution
- Component installation workflow
- Git-based component management

**Reading Time**: 10 minutes

**Related**: `src/utils/componentManager.ts`, `templates/components.json`

---

### [`graph-based-dependencies.md`](graph-based-dependencies.md)
**Purpose**: Dependency resolution algorithm

**When to Read**:
- Debugging circular dependency issues
- Implementing dependency validation
- Understanding install order
- Modifying prerequisite system

**Topics Covered**:
- Dependency graph construction
- Topological sorting for install order
- Circular dependency detection
- Optional vs required dependencies

**Reading Time**: 5-10 minutes

**Related**: `src/utils/prerequisitesManager.ts`

---

### [`working-directory-and-node-version.md`](working-directory-and-node-version.md)
**Purpose**: Node version management and command execution context

**When to Read**:
- Debugging Node version issues
- Implementing new command execution
- Understanding fnm integration
- Working with multi-version Node setup

**Topics Covered**:
- fnm (Fast Node Manager) integration
- Per-component Node version switching
- Working directory management
- Command execution context

**Reading Time**: 5 minutes

**Related**: `src/utils/externalCommandManager.ts`

---

### [`overview-archived-planning.md`](overview-archived-planning.md) ⚠️ **ARCHIVED**
**Purpose**: Historical planning document from initial design phase

**⚠️ Warning**: This document contains **outdated** information about approaches that were **never implemented** or were **rejected**. Do not use for current implementation guidance.

**Preserved For**: Historical context and understanding design evolution

**Do Not Read For**: Current architecture or implementation details

---

## Reading Paths

### For New Contributors

**Goal**: Understand the system to start contributing

1. **Start**: [`overview.md`](overview.md) - Get the big picture
2. **Then**: [`component-system.md`](component-system.md) - Understand core abstractions
3. **Finally**: [`adobe-setup.md`](adobe-setup.md) - Learn the most complex UI flow

**Time Investment**: 30-40 minutes  
**Result**: Ready to contribute to most areas of the codebase

---

### For System Architects

**Goal**: Deep understanding of architecture decisions

1. **Start**: [`overview.md`](overview.md) - Current architecture
2. **Then**: [`graph-based-dependencies.md`](graph-based-dependencies.md) - Dependency algorithm
3. **Then**: [`working-directory-and-node-version.md`](working-directory-and-node-version.md) - Execution context
4. **Review**: [`overview-archived-planning.md`](overview-archived-planning.md) - What was considered but not implemented

**Time Investment**: 45-60 minutes  
**Result**: Complete understanding of system design and trade-offs

---

### For UI Developers

**Goal**: Understand webview architecture and patterns

1. **Start**: [`overview.md`](overview.md) - Focus on "Webview Layer" section
2. **Then**: [`adobe-setup.md`](adobe-setup.md) - Study the two-column layout and progressive disclosure
3. **Finally**: `src/webviews/CLAUDE.md` - React component patterns

**Time Investment**: 25-30 minutes  
**Result**: Ready to work on webview components

---

### For Backend/Integration Developers

**Goal**: Understand Adobe I/O and command execution

1. **Start**: [`overview.md`](overview.md) - Focus on "Adobe Integration" section
2. **Then**: [`working-directory-and-node-version.md`](working-directory-and-node-version.md) - Command execution
3. **Finally**: `src/utils/CLAUDE.md` - Study ExternalCommandManager and AdobeAuthManager

**Time Investment**: 20-25 minutes  
**Result**: Ready to work on CLI integrations and process management

---

## Quick Reference

### Common Questions

**Q: Where do I find the wizard step definitions?**  
A: `templates/wizard-steps.json` (config) and `src/webviews/components/steps/` (React components)

**Q: How does Adobe authentication work?**  
A: See [`adobe-setup.md`](adobe-setup.md) for the flow, and `src/utils/adobeAuthManager.ts` for implementation

**Q: How are components cloned and installed?**  
A: See [`component-system.md`](component-system.md) and `src/utils/componentManager.ts`

**Q: Why does the extension use both Adobe CLI and SDK?**  
A: See [`overview.md`](overview.md#4-adobe-io-cli--console-sdk-hybrid) - CLI for auth, SDK for 30x faster operations

**Q: How does the auto-update system work?**  
A: See [`overview.md`](overview.md#6-auto-update-system) and `src/utils/updateManager.ts`

**Q: What's the "Backend Call on Continue" pattern?**  
A: See [`adobe-setup.md`](adobe-setup.md) and `docs/patterns/selection-pattern.md`

---

## Related Documentation

### Source Code Documentation
- **`src/CLAUDE.md`** - Source code organization
- **`src/commands/CLAUDE.md`** - Command implementations
- **`src/utils/CLAUDE.md`** - Utility functions and systems
- **`src/webviews/CLAUDE.md`** - React UI components
- **`templates/CLAUDE.md`** - Configuration file formats

### System Documentation
- **`docs/systems/prerequisites-system.md`** - Prerequisite checking and installation
- **`docs/systems/race-conditions.md`** - Race condition solutions
- **`docs/systems/logging-system.md`** - Logging architecture
- **`docs/systems/webview-loading.md`** - Webview loading states

### Development Guides
- **`docs/CLAUDE.md`** - Development strategy and best practices
- **`docs/patterns/selection-pattern.md`** - Backend Call on Continue pattern
- **`docs/patterns/state-management.md`** - State management patterns

---

## Maintenance

### Document Status

| Document | Status | Last Updated | Next Review |
|----------|--------|--------------|-------------|
| overview.md | ✅ Current | Jan 2025 | Apr 2025 |
| adobe-setup.md | ✅ Current | Jan 2024 | Apr 2025 |
| component-system.md | ⚠️ Needs minor updates | Oct 2024 | Feb 2025 |
| graph-based-dependencies.md | ✅ Current | Oct 2024 | Jul 2025 |
| working-directory-and-node-version.md | ✅ Current | Dec 2024 | Jun 2025 |

### Update Process

When making architectural changes:

1. **Update relevant architecture docs** within the same PR
2. **Update this index** if new docs are added or purposes change
3. **Update cross-references** in root CLAUDE.md and other docs
4. **Mark status** in the table above

### Contributing

Found outdated information? Please:
1. Create an issue describing what's outdated
2. Submit a PR with corrections
3. Update the "Last Updated" date
4. Tag @maintainers for review

---

**Index Last Updated**: January 2025  
**Index Maintained By**: Development Team

