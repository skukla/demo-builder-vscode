# Sidebar Feature

## Overview

The Sidebar feature provides contextual navigation for the Demo Builder extension using a WebviewViewProvider. It replaces the previous TreeView sidebar with a more flexible webview-based approach.

## Purpose

- Display contextual navigation based on current screen
- Show wizard progress during project creation
- Provide quick navigation between projects, screens, and settings
- Support back navigation and context switching

## Architecture

```
sidebar/
├── index.ts                    # Public exports
├── types.ts                    # Sidebar types (SidebarContext, NavItem, WizardStep)
├── providers/
│   └── sidebarProvider.ts      # WebviewViewProvider implementation
├── handlers/
│   └── sidebarHandlers.ts      # Message handlers
├── ui/
│   ├── index.tsx               # Webview entry point
│   ├── Sidebar.tsx             # Main sidebar component
│   └── components/
│       ├── index.ts            # Component exports
│       ├── SidebarNav.tsx      # Navigation list component
│       └── WizardProgress.tsx  # Wizard step progress component
└── CLAUDE.md                   # This file
```

## Context Types

The sidebar renders different content based on context:

```typescript
type SidebarContext =
    | { type: 'projects' }                           // Projects Dashboard
    | { type: 'project'; project: Project }          // Project Detail
    | { type: 'wizard'; step: number; total: number } // Wizard
    | { type: 'configure'; project: Project };       // Configure
```

### Projects Context
- Header: "Demo Builder"
- Navigation: Projects (active)
- No back button

### Project Detail Context
- Header: Project name
- Navigation: Overview, Configure, Updates
- Back button: "← Projects"

### Wizard Context
- Header: "NEW DEMO"
- Shows wizard progress with step indicators
- Back button: "← Cancel"

### Configure Context
- Header: Project name
- Navigation: Overview, Configure (active), Updates
- Back button: "← Projects"

## Components

### Sidebar

Main container component that renders context-specific content.

**Props:**
- `context: SidebarContext` - Current sidebar context
- `onNavigate: (target: string) => void` - Navigation callback
- `onBack?: () => void` - Back navigation callback

### SidebarNav

Navigation list for sidebar items.

**Props:**
- `items: NavItem[]` - Navigation items to display
- `onNavigate: (id: string) => void` - Item click callback

### WizardProgress

Displays wizard step progress with indicators.

**Props:**
- `steps: WizardStep[]` - Wizard steps
- `currentStep: number` - Current step index (0-based)
- `completedSteps: number[]` - Array of completed step indices
- `onStepClick?: (stepIndex: number) => void` - Step click callback

**Progress Indicators:**
- ✓ = Completed (checkmark, muted color)
- ● = Current (filled dot, accent color)
- ○ = Future (empty dot, muted color)

## Provider

### SidebarProvider

Implements `vscode.WebviewViewProvider` for the sidebar.

**View ID:** `demoBuilder.sidebar`

**Methods:**
- `resolveWebviewView()` - Called when sidebar needs to be resolved
- `sendMessage(type, data)` - Send message to webview
- `updateContext(context)` - Update sidebar context

## Handlers

All handlers follow **Pattern B** (return values, not sendMessage):

### handleNavigate

Handles navigation requests.

```typescript
const result = await handleNavigate(context, { target: 'projects' });
// { success: true }
```

### handleGetContext

Returns current sidebar context.

```typescript
const result = await handleGetContext(context);
// { success: true, data: { context: { type: 'projects' } } }
```

### handleSetContext

Sets sidebar context (mainly for wizard state).

```typescript
const result = await handleSetContext(context, { context: { type: 'wizard', step: 2, total: 6 } });
// { success: true }
```

## Message Types

| Message | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `getContext` | UI → Extension | - | `contextResponse` |
| `contextResponse` | Extension → UI | `{ context }` | - |
| `contextUpdate` | Extension → UI | `{ context }` | - |
| `navigate` | UI → Extension | `{ target }` | - |
| `back` | UI → Extension | - | - |

## Styling

Uses existing design system:
- React Spectrum components (Flex, Text, ActionButton, Divider)
- VS Code theme variables
- Spectrum design tokens

## Testing

Tests located in `tests/features/sidebar/`:

```
tests/features/sidebar/
├── testUtils.ts                          # Shared test utilities
├── handlers/
│   └── sidebarHandlers.test.ts           # Handler tests
├── providers/
│   └── sidebarProvider.test.ts           # Provider tests
└── ui/
    ├── Sidebar.test.tsx                  # Main component tests
    └── components/
        ├── SidebarNav.test.tsx           # Nav tests
        └── WizardProgress.test.tsx       # Progress tests
```

## Dependencies

- `@/core/state/stateManager` - State management
- `@/core/logging/logger` - Logging
- `@/types/base` - Project interface
- VS Code WebviewViewProvider API
- React Spectrum components

## Related Features

- **projects-dashboard** - Main content when sidebar shows projects context
- **project-creation** - Wizard that updates sidebar context
- **dashboard** - Project detail screen

## Package.json Configuration

The sidebar must be registered in `package.json`:

```json
"views": {
  "demoBuilder": [
    {
      "id": "demoBuilder.sidebar",
      "name": "Demo Builder",
      "type": "webview"
    }
  ]
}
```

## Webpack Configuration

The sidebar entry point must be added to `webpack.config.js`:

```javascript
entry: {
    // ... existing entries
    sidebar: './src/features/sidebar/ui/index.tsx'
}
```
