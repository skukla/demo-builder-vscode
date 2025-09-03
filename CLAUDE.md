# Adobe Demo Builder VS Code Extension

## Project Overview

The Adobe Demo Builder is a VS Code extension that streamlines the creation of Adobe Commerce demo projects. It provides a wizard-based interface for setting up complex e-commerce demonstrations with various Adobe technologies integrated.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   VS Code Extension Host                  │
├─────────────────────────────────────────────────────────┤
│  Extension Activation (extension.ts)                     │
│  ├── Command Registration                                │
│  ├── State Management                                    │
│  └── Provider Registration                               │
├─────────────────────────────────────────────────────────┤
│              Core Systems                                │
│  ├── Prerequisites System (JSON-driven)                  │
│  ├── Component Registry (templates/)                     │
│  ├── Progress Tracking (ProgressUnifier)                 │
│  └── Error Logging System                                │
├─────────────────────────────────────────────────────────┤
│              Webview Layer (React)                       │
│  ├── Wizard UI (Adobe Spectrum)                          │
│  ├── Message Protocol (vscode.postMessage)              │
│  └── Step Components                                     │
└─────────────────────────────────────────────────────────┘
```

## Directory Structure

```
demo-builder-vscode/
├── src/                    # Source code (→ see src/CLAUDE.md)
│   ├── commands/          # VS Code commands (→ see src/commands/CLAUDE.md)
│   ├── webviews/          # React UI components (→ see src/webviews/CLAUDE.md)
│   ├── utils/             # Utilities & systems (→ see src/utils/CLAUDE.md)
│   ├── providers/         # VS Code providers
│   └── types/             # TypeScript definitions
├── templates/             # Configuration templates (→ see templates/CLAUDE.md)
├── docs/                  # Documentation
│   └── CLAUDE.md         # Development strategy & guidelines
├── dist/                  # Compiled output
└── media/                 # Static assets
```

## Key Components

### 1. **Wizard System**
- Multi-step project creation wizard
- React-based UI using Adobe Spectrum
- Maintains state across steps
- Width constraint solution: Replace Spectrum Flex with div for layouts

### 2. **Prerequisites System**
- JSON-driven prerequisite definitions
- Automatic tool installation
- Progress tracking with multiple strategies
- Supports Node.js multi-version management

### 3. **Component Registry**
- Defines available project components
- Manages dependencies between components
- Dynamic configuration based on selections

### 4. **Webview Communication**
- Bidirectional message passing
- Type-safe message protocol
- State synchronization between extension and UI

## Critical Design Decisions

### Adobe Spectrum Integration
- **Issue**: Flex component constrains width to 450px
- **Solution**: Use standard HTML div with flex styles for critical layouts
- **Details**: See `src/webviews/CLAUDE.md`

### Prerequisites UI
- **Scrollable Container**: Fixed height (360px) with internal scrolling
- **Auto-scroll**: Intelligent scrolling during prerequisite checking
- **Visual Consistency**: Standardized status indicators with icons
- **Details**: See `docs/systems/prerequisites-system.md`

### State Management
- Extension state persisted via StateManager
- Webview state managed with React hooks
- Message passing for state synchronization

## Key Files to Understand

1. **extension.ts** - Entry point and command registration
2. **src/commands/createProjectWebview.ts** - Main wizard orchestration
3. **src/webviews/components/wizard/WizardContainer.tsx** - Wizard UI container
4. **templates/prerequisites.json** - Prerequisite definitions
5. **templates/components.json** - Component registry

## Common Tasks

### Adding a New Prerequisite
→ See `templates/CLAUDE.md` and `docs/systems/prerequisites-system.md`

### Modifying Wizard Steps
→ See `src/webviews/components/steps/` and `src/webviews/CLAUDE.md`

### Debugging Width Issues
→ See `docs/troubleshooting.md` and use WidthDebugger component

### Adding New Commands
→ See `src/commands/CLAUDE.md`

## Technology Stack

- **Extension**: TypeScript, VS Code Extension API
- **UI**: React, Adobe Spectrum, Webpack
- **Build**: TypeScript compiler, Webpack
- **Testing**: Manual testing checklist (automated tests planned)

## Development Workflow

1. Install dependencies: `npm install`
2. Build: `npm run build`
3. Watch mode: `npm run watch`
4. Run extension: F5 in VS Code
5. Package: `npm run package`

## Recent Improvements

- Fixed wizard width inconsistencies (450px → 800px)
- Improved prerequisites UI with scrollable container
- Standardized status message displays
- Enhanced error message parsing for Adobe I/O CLI
- Comprehensive documentation updates

## Future Enhancements

- Automated testing framework
- Performance monitoring
- Enhanced error reporting  
- Accessibility improvements
- Windows/Linux platform support

---

For detailed information about specific areas, navigate to the CLAUDE.md file in the relevant directory.