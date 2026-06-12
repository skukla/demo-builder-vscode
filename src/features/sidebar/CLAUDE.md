# Sidebar Feature

## Overview

The Sidebar feature provides contextual navigation for the Demo Builder extension using a WebviewViewProvider. Layout language matches the Project Dashboard: labeled zones, hero/quiet hierarchy, hidden-not-disabled gating.

## Purpose

- Display contextual navigation based on current screen
- Provide AI access (Chat + Prompts) scoped to project context
- Support back navigation and context switching

## Architecture

```
sidebar/
├── index.ts                    # Public exports
├── types.ts                    # Sidebar types (SidebarContext, SidebarMessageType)
├── providers/
│   └── sidebarProvider.ts      # WebviewViewProvider implementation
├── handlers/
│   └── sidebarHandlers.ts      # Message handlers
├── ui/
│   ├── index.tsx               # Webview entry point
│   ├── Sidebar.tsx             # Main sidebar component
│   ├── views/
│   │   └── UtilityBar.tsx      # 4-icon footer row (Tools, Help, Settings, Logs)
│   └── components/
│       ├── index.ts            # Component exports
│       └── AiZone.tsx          # AI icon pair (Chat + Prompts); appears in
│                               # project mode
└── CLAUDE.md                   # This file
```

## Layout

The sidebar renders the **same layout in every context**: an `AiZone`
(Chat + Prompts) above a `UtilityBar` (Tools + Help + Settings + Logs), vertically
centered as a single group.

```typescript
type SidebarContext =
    | { type: 'projects' }                              // Projects Dashboard (no project loaded)
    | { type: 'projectsList' }                          // Projects List home grid
    | { type: 'project'; project: Project };            // Project Detail
```

`SidebarContext` is retained for the message protocol — handlers and the
provider still send/receive a context — but it does not affect the
rendered layout. All three contexts render identically because:
- **AI is globally available** (MCP is wired at the extension level, not
  per project) — the `AiZone` always renders.
- The other previously-context-specific surfaces have moved out of the
  sidebar entirely:
  - The wizard's progress timeline lives inside the wizard webview's own
    left column (`WizardContainer`'s `.wizard-timeline-column`).
  - Configure is a self-contained webview tab with its own Cancel footer.

### Rendered layout (all contexts)
- `AiZone` with **Chat** and **Prompts** buttons (renders when both
  `onOpenAiChat` and `onShowPrompts` callbacks are provided — they are
  always provided in practice).
- `UtilityBar` in compact mode — four icons: **Tools / Help / Settings / Logs**.
- Both groups centered as a single vertical block (`justifyContent="center"`,
  `gap="size-400"`).
- No dividers, no project name, no nav list. The dashboard, configure
  webview, and wizard webview own those surfaces.

Safety net: when the user closes the Project Dashboard tab inside a project
workspace, the projects list webview auto-reopens as a new tab so the user
keeps a Demo Builder navigation surface (see
`src/features/dashboard/commands/showDashboard.ts::dispose`).

## Components

### Sidebar

Main container component that renders context-specific content.

**Props:**
- `context: SidebarContext` - Current sidebar context
- `onNavigate: (target: string) => void` - Navigation callback
- `onBack?: () => void` - Back navigation callback
- `onOpenAiChat?: () => void` - Backs the Chat button in `AiZone`
- `onShowPrompts?: () => void` - Backs the Prompts button in `AiZone`
- (utility callbacks: `onOpenTools`, `onOpenHelp`, `onOpenSettings`, `onOpenLogs`)

### AiZone

Labeled sidebar zone with two single-purpose AI actions.

**Props:**
- `onOpenAiChat: () => void` — invokes the Chat button. Routes to
  `demoBuilder.openAiExperience` (opens or focuses the Claude terminal).
- `onShowPrompts: () => void` — invokes the Prompts button. Routes to
  `demoBuilder.showPromptsPicker` (shows the prompt QuickPick).

**Rendering:**
- Zone label "AI" (small caps via `sidebar-zone-label`).
- Chat button (`MagicWand` icon + label).
- Prompts button (`Chat` icon + label).

The zone replaces the prior state-aware wand icon in `UtilityBar`. Each
button is single-purpose — no state branching, no hidden second click.

### UtilityBar

Four-icon horizontal utility row. AI is **not** here — it lives in `AiZone`.

**Props:**
- `onOpenTools?: () => void` — Tools icon (Wrench)
- `onOpenHelp?: () => void` — Help icon
- `onOpenSettings?: () => void` — Settings icon
- `onOpenLogs?: () => void` — Logs icon (ViewList); reuses `toggleLogsPanel`
- `compact?: boolean` — auto height instead of `100%` (for footer placement)

Buttons render only when their callback prop is provided.

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

Sets sidebar context (used by commands to push a new context to the webview).

```typescript
const result = await handleSetContext(context, { context: { type: 'projectsList' } });
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
| `openAiChat` | UI → Extension | - | Routes to `demoBuilder.openAiExperience` |
| `showPrompts` | UI → Extension | - | Routes to `demoBuilder.showPromptsPicker` |
| `openLogs` | UI → Extension | - | Routes to `toggleLogsPanel` (lifecycle) |
| `setContext` | UI → Extension | `{ context }` | - |

## Styling

Uses existing design system:
- React Spectrum components (Flex, Text, ActionButton, Divider)
- VS Code theme variables
- Spectrum design tokens
- `sidebar-zone-label` class for zone headers (matches dashboard's
  `dashboard-zone-label` pattern)

## Testing

Tests located in `tests/features/sidebar/`:

```
tests/features/sidebar/
├── testUtils.ts                          # Shared test utilities
├── handlers/
│   └── sidebarHandlers.test.ts           # Handler tests
├── providers/
│   └── sidebarProvider.test.ts           # Provider tests
├── integration/
│   ├── extensionActivation.test.ts       # Activation wiring
│   └── navigationCommands.test.ts        # Navigation routing
└── ui/
    ├── Sidebar.test.tsx                  # Main component tests
    └── views/
        ├── UtilityBar.test.tsx           # Utility bar tests
        └── views-removal.test.ts         # Legacy view-removal regression
```

## Dependencies

- `@/core/state/stateManager` - State management
- `@/core/logging/logger` - Logging
- `@/types/base` - Project interface
- VS Code WebviewViewProvider API
- React Spectrum components

## Related Features

- **projects-dashboard** - Main content when sidebar shows projects context
- **project-creation** - Wizard webview that hosts its own progress timeline (no sidebar coupling)
- **dashboard** - Project detail screen
- **commands/openInClaude.ts** - Backs `demoBuilder.openAiExperience`,
  invoked by AiZone's Chat button
- **commands/showPromptsPicker.ts** - Single-purpose prompt picker, invoked
  by AiZone's Prompts button
- **dashboard/handlers/aiHandlers.ts** - Provides `readMergedAiPrompts` for
  the prompt picker

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

## Build Configuration

The sidebar entry point is registered in `esbuild.config.js` (the project uses
esbuild, not webpack):

```javascript
const WEBVIEW_ENTRIES = {
    // ... existing entries
    sidebar: 'src/features/sidebar/ui/index.tsx',
};
```
