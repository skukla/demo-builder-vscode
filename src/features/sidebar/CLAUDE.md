# Sidebar

A `WebviewViewProvider` giving one persistent surface: AI access plus a utility
row. Most of this file is layout reasoning, because the sidebar is a narrow panel
that survives editor zoom, and nearly every obvious CSS choice here has already
been tried and reverted.

```
sidebar/
├── providers/sidebarProvider.ts   WebviewViewProvider (view id demoBuilder.sidebar)
├── handlers/sidebarHandlers.ts    message handlers, Pattern B (return, never push)
├── types.ts                       SidebarContext, SidebarMessageType
└── ui/
    ├── Sidebar.tsx                the container
    ├── components/AiZone.tsx      Chat (a menu) + Prompts
    └── views/UtilityBar.tsx       Tools · Help · Settings · Logs
```

## One layout, every context

`SidebarContext` has three shapes — `projects`, `projectsList`, `project` — and
**none of them changes what renders.** The context is retained for the message
protocol only.

All three render identically because AI is globally available: MCP is wired at the
extension level rather than per project, so the AI zone always shows. Everything
that used to be context-specific moved out — the wizard's progress timeline lives
in the wizard webview's own left column, and Configure is a self-contained tab with
its own Cancel footer. Neither is a sidebar context.

Six tiles total: two in `AiZone`, four in `UtilityBar`. No dividers, no project
name, no nav list.

*Safety net:* closing the Project Dashboard tab inside a project workspace
auto-reopens the projects list, so the user is never left without a Demo Builder
surface (`dashboard/commands/showDashboard.ts::dispose`).

## AiZone

Two tiles. **Chat** is a `MenuTrigger` offering *Continue chat* / *New chat*;
**Prompts** is a plain button opening the QuickPick. The zone label uses
`dashboard-zone-label`, shared with the dashboard.

Supplying `onNewAiChat` is what turns Chat into a menu — without it the tile stays
a plain button, so a caller predating the menu is unaffected.

**Why New chat exists at all.** Every launch otherwise resumes, and a resumed
conversation never re-reads `AGENTS.md` — so it keeps whatever generated guidance it
was born with, however many `AI_CONTEXT_VERSION` bumps ago. This is the only route
onto the current bundle.

**Why Chat is a menu rather than a third tile.** Continuing and starting fresh are
two ways to do one thing, so they sit behind one affordance. A third flat tile read
as a third feature and pushed the stack past the panel at editor zoom.

**No chevron on the Chat tile — tried twice, reverted 2026-08-24.** The tile is a
64px column holding an 18px icon and an 11px label, with no room for a second
element on either line. As a third child the chevron became its own row; inline
beside the label it squeezed the text until `overflow-wrap: anywhere` broke it to
one character per line.

A **Prompt Workbench** was a third tile until 2026-08-26, when it moved to the
prompt-evaluation branch with the rest of that surface.

## The layout rules, and why each one is not the obvious choice

**Top-aligned, not centred.** `.sidebar-view` sets `justify-content: flex-start`
with `padding-top: 20px`, so leftover vertical space gathers BELOW the last tile
instead of being split above and below it. That slack is exactly where a new tile
extends into.

Three versions, each with a reason: `padding-top: 80px` (fixed, had to be re-derived
per tile count) → `safe center` (self-adjusting, but split the slack) → `flex-start`
(self-adjusting *and* the slack is usable). Dropping `safe` also dropped its hazard:
plain `center` overflowed a short panel in BOTH directions and pushed the first tile
above the scroll origin, where `flex-start` can only overflow downward into the
provider's scroll.

This is also what settled an argument twice decided wrongly. Two earlier readings
called a third tile impossible on the arithmetic — "a seventh tile needs 596px
against a 600px breakpoint, four pixels, too thin". **Both missed that the stack was
CENTRED**, so half the leftover space sat above the label doing nothing while the
stack was treated as out of room.

**One column, wrapping 2-up only when short.** Tiles live in `.sidebar-tile-grid` —
a plain div, not a Spectrum `Flex`, because of the 450px width constraint. Default
is one per row. Under `@media (max-height: 640px)` they wrap two per row.

**The 640px threshold is DERIVED, not eyeballed.** It must exceed the height the
roomy layout actually needs, or the last tile is clipped in the gap between the two
modes — at 560px it was, by about 12px. `custom-spectrum.css` points at this file
for the arithmetic, so it lives here:

```
content = 32 (padding) + per zone: 18 (label) + 8 + rows*64 + (rows-1)*8, + 24 between zones

6 tiles -> 1-up 524px | 2-up 308px      <- TODAY
7 tiles -> 1-up 600px | 2-up 380px
8 tiles -> 1-up 672px | 2-up 384px
```

**The breakpoint is currently conservative by one tile.** It was derived when there
were seven tiles and needed 600px; the Workbench left and nobody recomputed. Six
tiles need 524px, so the panel wraps to 2-up earlier than it has to. Safe, but if
you add a tile, recompute from the table rather than assuming 640 still fits.

**Fixed px, deliberately — do NOT make tiles viewport-relative.**
`clamp(40px, 7.5vh, 64px)` was tried and reverted on 2026-08-24. `vh` measures the
panel in CSS px, and editor zoom makes a CSS px physically larger, so the viewport
measured in them *shrinks as you zoom IN*. The tiles shrank while every px-sized
neighbour grew, and labels began wrapping ("Prompt / s") beside full-size project
cards. Fixed px holds them in proportion because the rest of the UI is px too.
Where the stack exceeds a short panel at heavy zoom, the provider scrolls — the
correct degradation, and strictly better than the clipping it replaced.

## Messages

Handlers follow Pattern B: they return a result, never push a message back.

| Message | Direction | Payload |
|---------|-----------|---------|
| `getContext` | UI → Extension | — (answered by `contextResponse`) |
| `contextResponse` / `contextUpdate` | Extension → UI | `{ context }` |
| `setContext` | UI → Extension | `{ context }` |
| `navigate` | UI → Extension | `{ target }` |
| `back` | UI → Extension | — |
| `openAiChat` | UI → Extension | routes to `demoBuilder.openAiExperience` |
| `showPrompts` | UI → Extension | routes to `demoBuilder.showPromptsPicker` |
| `openLogs` | UI → Extension | routes to `toggleLogsPanel` |

## Related

- [`../../commands/CLAUDE.md`](../../commands/CLAUDE.md) — `openInClaude` and
  `showPromptsPicker`, which the AI tiles dispatch to
- `spectrum-webview-ui` skill — the Flex width constraint and the other
  webview layout traps this file keeps running into
