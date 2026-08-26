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

Labeled sidebar zone with THREE tiles: Chat ⌄ (a menu), Prompts, Workbench.

**Props:**
- `onOpenAiChat: () => void` — "Continue chat". Routes to
  `demoBuilder.openAiExperience` (opens or focuses the Claude terminal,
  resuming via `claude --continue`).
- `onShowPrompts: () => void` — the Prompts tile. Routes to
  `demoBuilder.showPromptsPicker` (shows the prompt QuickPick).
- `onShowWorkbench?: () => void` — OPTIONAL. Routes to
  `demoBuilder.showEvaluationWorkbench`. Supplying it is what RENDERS the third
  tile; without it the tile is absent, so callers predating it are unaffected.
- `onNewAiChat?: () => void` — OPTIONAL "New chat". Routes to
  `demoBuilder.newAiChat`, which starts a FRESH conversation. Supplying it is
  what turns the Chat tile into a menu; without it the tile stays a plain
  button, so callers predating the menu are unaffected.

**Rendering:**
- Zone label "AI" (small caps via `dashboard-zone-label`).
- Chat tile (`MagicWand` icon + label) — a `MenuTrigger` offering
  **Continue chat** / **New chat**. NO chevron: tried twice and reverted
  2026-08-24. The tile is a 64px `flex-direction: column` box holding an 18px
  icon and an 11px label, with no room for a second element on either line. As a
  third child the chevron became its own row; inline beside the label it squeezed
  the text until `overflow-wrap: anywhere` broke it to one character per line.
- Prompts tile (`Chat` icon + label) — plain button, opens the QuickPick.
- Workbench tile (`Beaker` icon + label) — plain button, opens the Prompt
  Workbench. The beaker is the same glyph the simulate vocabulary uses on the
  prompt card's kebab and in the status bar, so one concept keeps one symbol.

**Why Chat is a menu, not a third tile.** Continuing and starting fresh are two
ways to do one thing, so they live behind one affordance — the same shape as the
projects toolbar's `New ⌄` button (`ProjectsDashboard.tsx`). A third flat tile
read as a third feature and pushed the six-tile stack past the panel at editor
zoom.

**Why the Prompt Workbench IS a tile (2026-08-25), after two attempts said
otherwise.** An early flat tile was withdrawn for pushing the stack past the
viewport at zoom. Step 10 then folded it into a `Prompts ⌄` menu, reading the
arithmetic as "a seventh tile needs 596px against a 600px breakpoint — four
pixels, too thin".

**Both readings missed that the stack was CENTRED.** Centring splits the leftover
space between top and bottom, so half of it sat above the "AI" label doing
nothing while the stack was treated as out of room. The owner made the call:
top-align, and the slack gathers below the last tile — which is exactly where a
new tile extends into. The breakpoint was recomputed to 640px at the same time,
giving the roomy layout 40px of real slack rather than four.

The other half of the original objection — that a third tile "reads as a third
feature" — was overruled deliberately: the workbench IS a third thing you do with
an agent, beside chatting and picking a prompt.

**Why New chat exists at all.** Every launch otherwise resumes, and a resumed
conversation never re-reads `AGENTS.md` — so it keeps whatever generated guidance
it was born with, however many `AI_CONTEXT_VERSION` bumps ago. This is the only
route onto the current bundle.

**Top-aligned, 20px above.** `.sidebar-view` uses `justify-content: flex-start`
so the leftover vertical space gathers BELOW the last tile instead of being split
above and below it. That is what makes room for tiles without touching the tile
size. Three versions, each with a reason: `padding-top: 80px` (fixed, had to be
re-derived per tile count) → `safe center` (self-adjusting, but split the slack)
→ `flex-start` (self-adjusting AND the slack is usable).

`safe` is no longer needed and its hazard goes with it: plain `center` overflowed
a too-short panel in BOTH directions and pushed the first tile above the scroll
origin; `flex-start` can only overflow downward, into `.sidebar-provider`'s
scroll.

*This paragraph described the 80px offset until 2026-08-25, long after the CSS
stopped doing it, and the threshold comment cited the 572px figure that offset
produced. Both corrected, then corrected again when the tile landed.*

**Layout — one column, wrapping 2-up only when short.** Tiles live in
`.sidebar-tile-grid`, a plain div (not a Spectrum `Flex` — width gotcha). Default
is one per row, the original look. Under `@media (max-height: 640px)` they wrap
two per row: stacked, each tile costs 72px, so the roomy layout needs 600px for
SEVEN tiles and Logs was being clipped on a zoomed panel; wrapped, seven take
~380px, and an eighth fills the slot beside the seventh without adding a row.

**The 640px threshold is DERIVED, not eyeballed** — it must exceed the height the
roomy layout actually needs, or the last tile is clipped in the gap between the
two modes (at 560px it was, by ~12px). Adding tiles means recomputing it, ~72px
per tile:

```
content = 32 (padding) + per zone: 18 (label) + 8 + rows*64 + (rows-1)*8, + 24 between zones
6 tiles -> 1-up 524px | 2-up 308px      8 tiles -> 1-up 672px | 2-up 384px
7 tiles -> 1-up 600px | 2-up 380px      <- TODAY, against a 640px breakpoint
```

Centring does not remove the need for the breakpoint: it balances the space that
exists, while the wrap is what makes the stack FIT in the first place.

**Sizing — fixed px, deliberately.** Tiles are a fixed 64px and must NOT be made
viewport-relative. `clamp(40px, 7.5vh, 64px)` was tried and reverted on
2026-08-24: `vh` measures the panel in CSS px, and editor zoom makes a CSS px
physically larger, so the viewport measured in them shrinks as you zoom IN. The
tiles shrank while every px-sized neighbour grew, and labels began wrapping
("Prompt / s") beside full-size project cards. Fixed px is what holds them in
proportion, because the rest of the UI is px too. Where the stack exceeds a short
panel at heavy zoom, `.sidebar-provider` scrolls — the correct degradation, and
strictly better than the clipping it used to do.

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
