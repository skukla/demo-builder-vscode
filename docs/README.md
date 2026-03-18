# Documentation Index

Welcome to the Adobe Demo Builder VS Code Extension documentation. This guide will help you navigate the various documentation resources available.

## 📚 Documentation Structure

### For Users
- **[Main README](../README.md)** - Quick start guide and basic usage
- **[Changelog](./CHANGELOG.md)** - Release notes and version history

### For Developers

#### 🏗 Architecture
Documentation about system design and high-level architecture.

- **[Architecture Overview](./architecture/overview.md)** - Complete system architecture and design decisions
- **[Component System](./architecture/component-system.md)** - Component-based architecture for frontends, backends, and dependencies
- **[Graph-Based Dependencies](./architecture/graph-based-dependencies.md)** - Future architecture for flexible entity relationships

#### ⚙️ Systems
Detailed documentation about specific subsystems.

- **[Prerequisites System](./systems/prerequisites-system.md)** - Comprehensive guide to the configuration-driven prerequisites and progress tracking system
- **[Error Logging](./systems/error-logging.md)** - Error handling, logging strategy, and notification system
- **[Custom Block Libraries](./systems/custom-block-libraries.md)** - Creating standalone block libraries for use with the Demo Builder
- **[Webview Loading](./systems/webview-loading.md)** - VS Code webview initialization and loading state management

#### 👨‍💻 Development
Guides for developers working on the extension.

- **[Development Strategy](./DEVELOPMENT-STRATEGY.md)** - Overall development approach and methodology
- **[Build Instructions](./build.md)** - How to build and run the extension from source
- **[Styling Guide](./development/styling-guide.md)** - CSS architecture and React Spectrum styling patterns
- **[UI Patterns](./development/ui-patterns.md)** - UI/UX decisions and implementation patterns

## 🎯 Quick Navigation

### By Topic

**Building & Running**
- Build from source → [Build Instructions](./build.md)
- Development setup → [Build Instructions - Quick Start](./build.md#quick-start)
- Troubleshooting builds → [Build Instructions - Troubleshooting](./build.md#troubleshooting)

**Prerequisites & Installation**
- How prerequisites work → [Prerequisites System](./systems/prerequisites-system.md)
- Adding new prerequisites → [Prerequisites System - Developer Guide](./systems/prerequisites-system.md#developer-guide)
- Progress tracking → [Prerequisites System - Progress Tracking](./systems/prerequisites-system.md#progress-tracking-system)

**Component Management**
- Understanding components → [Component System](./architecture/component-system.md)
- Component registry → [Component System - Registry](./architecture/component-system.md#component-registry)
- Adding new components → [Component System - Definition Structure](./architecture/component-system.md#component-definition-structure)

**UI Development**
- React Spectrum patterns → [UI Patterns](./development/ui-patterns.md)
- CSS organization → [Styling Guide](./development/styling-guide.md)
- Webview development → [Webview Loading](./systems/webview-loading.md)

**Error Handling**
- Error strategy → [Error Logging](./systems/error-logging.md)
- Logging levels → [Error Logging - Notification Levels](./systems/error-logging.md#error-notification-levels)
- Debugging → [Error Logging - Implementation](./systems/error-logging.md#implementation)

**Testing**
- Test organization → [Test README](../tests/README.md)
- Running tests → [Test README - Running Tests](../tests/README.md#running-tests)
- Writing new tests → [Test README - Writing New Tests](../tests/README.md#writing-new-tests)
- Test coverage → [Test README - Test Coverage](../tests/README.md#test-coverage)

### By Audience

**Extension Users**
1. Start with the [Main README](../README.md)
2. Check the [Changelog](./CHANGELOG.md) for updates

**New Contributors**
1. Read [Development Strategy](./DEVELOPMENT-STRATEGY.md)
2. Review [Architecture Overview](./architecture/overview.md)
3. Study relevant system docs based on your area of work

**Core Developers**
1. [Prerequisites System](./systems/prerequisites-system.md) for dependency management
2. [Component System](./architecture/component-system.md) for component architecture
3. [Styling Guide](./development/styling-guide.md) for UI development

**System Architects**
1. [Architecture Overview](./architecture/overview.md)
2. [Graph-Based Dependencies](./architecture/graph-based-dependencies.md)
3. All system documentation in [/systems](./systems/)

## 📝 Documentation Standards

When contributing documentation:

1. **Location**: Place docs in the appropriate subdirectory
   - `/architecture/` - System design and architecture
   - `/systems/` - Detailed system documentation
   - `/development/` - Developer guides and patterns
   - `/reference/` - API references and quick lookups

2. **Naming**: Use descriptive, hyphenated lowercase names
   - Good: `prerequisites-system.md`, `error-logging.md`
   - Avoid: `tech.md`, `misc-notes.md`

3. **Structure**: Include clear sections
   - Overview/Introduction
   - Architecture/Design (if applicable)
   - Implementation/Usage
   - Examples
   - API Reference (if applicable)
   - Best Practices
   - Troubleshooting

4. **Cross-References**: Link to related documentation
   - Use relative paths
   - Update this index when adding new docs

## 🔄 Keeping Documentation Updated

- Update relevant docs when making system changes
- Add entries to [CHANGELOG.md](./CHANGELOG.md) for user-facing changes
- Review and update examples when APIs change
- Maintain this index when adding/removing documentation

## 📋 Documentation Roadmap

Planned documentation improvements:
- [ ] API reference documentation
- [ ] Testing guide
- [ ] Deployment guide
- [ ] Security best practices
- [ ] Performance optimization guide
- [ ] Troubleshooting compendium