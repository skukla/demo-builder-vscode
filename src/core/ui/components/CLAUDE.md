# Shared UI Components — the house vocabulary

**Read this BEFORE writing a new component under any `ui/` directory.** Everything here is
already built, already tested, and already the extension's visual language. A feature that
rebuilds one of these does not get a neutral copy — it gets a copy that drifts, because the
next fix lands on one of the two.

The counterpart index for hooks is `../hooks/CLAUDE.md`.

## Pick by JOB, not by name

| The job | Use | Not |
|---|---|---|
| Full-block loading (empty view, waiting on a fetch) | `feedback/LoadingDisplay` (`size="L"`) | a bare `ProgressCircle` + label |
| Loading ON TOP of existing content | `feedback/LoadingOverlay` | a conditional spinner |
| Small inline busy indicator | `ui/Spinner` | `ProgressCircle` directly |
| Long wait needing "still moving" copy | `LoadingDisplay` + `useElapsedStage` | a static message |
| Error / empty / success full-block state | `feedback/StatusDisplay` (`variant`, `actions[]`) | red `<Text>`, a bespoke panel |
| "Nothing here yet" + a CTA | `feedback/EmptyState` | a hand-rolled centered div |
| Ambient status badge (dot + label + value) | `feedback/StatusCard` (`action` for remediation) | an inline colored span |
| Just the status dot | `ui/StatusDot` | a styled `<span>` |
| Centering any of the above at a fixed height | `layout/CenteredFeedbackContainer` | ad-hoc flex + height |
| Adobe API catalog fetch states | `feedback/ApiCatalogFeedback` | re-deriving loading/sign-in/error |
| Card overflow (kebab) menu | `ui/CardActionsMenu` + `ui/menuIcons` | a bespoke `MenuTrigger` |
| A menu row's icon | `renderMenuIcon('<concept>')` | importing a Spectrum icon per menu |
| One integration in a list or grid | `integrations/IntegrationCard` | a per-surface integration row |
| The deploy destination, once per surface | `ui/DestinationContext` | a per-card "Deploys to" line |
| Rename in place | `forms/InlineRenameField` | a bespoke pencil + TextField |
| Any modal | `ui/Modal` | `DialogContainer` assembled by hand |
| A modal too tall or too narrow for its content | `ui/Modal` `fitContent` / `wide` props | CSS aimed at the Dialog — the constraint lives on Spectrum's wrapper, not the dialog's own box |
| Slide-in right panel for detail beside a list or grid | `ui/Drawer` | Spectrum `Tray` (mobile-only, unmocked in the test stack) or a bespoke scrim + panel |
| Page shell (header, back, footer) | `layout/PageLayout` + `PageHeader` + `PageFooter` | a bespoke page div |
| Full-screen surface: sticky search band over a 960px body | `layout/FullScreenSurface` | re-inlining `.projects-sticky-header` + `.page-container-padded` |
| Two-column / grid / sidebar layout | `layout/TwoColumnLayout`, `GridLayout`, `ContentWithSidebar` | raw flex (see the 450px trap) |
| Search box over a list | `navigation/SearchHeader` / `SearchableList` | a TextField + filter |
| Copy-to-clipboard value | `ui/CopyableText` | a Button + clipboard call |
| Numbered how-to steps | `ui/NumberedInstructions` | an `<ol>` |
| Wizard config summary / step status | `wizard/ConfigurationSummary`, `StatusSection` | a bespoke summary |
| Horizontal strip of step tabs | `navigation/StepRail` | a bespoke tablist |
| Area shell: rail strip over a swapping view | `layout/StepAreaShell` | inlining `.step-nav` + `.step-view` |

Auth surfaces have a house treatment too: **signed-out is never a Retry.** It is a
`StatusDisplay` whose action starts a user-initiated sign-in (`AdobeAuthStep` is the
reference; `ApiCatalogFeedback` applies it).

## Verify rather than trust this table

It is a map, not the territory — a component may have been added since. Before concluding
something does NOT exist:

```bash
ls src/core/ui/components/*/            # the full vocabulary, always current
grep -rn "<the job, e.g. EmptyState>" src/core/ui/components/
grep -rln "StatusDisplay\|LoadingDisplay" src/features/  # how peers already use it
```

If a peer feature already solves your exact job, **reuse or extract — do not copy**. The
extraction rule is Rule of Three (extract at the third instance), with one override that
matters here: if the same behaviour has already been FIXED separately on two surfaces, that
is demonstrated drift and it gets extracted at two.

## When something genuinely does not fit

Extend the shared component (a new prop, a new variant) rather than forking it beside its
twin. If it truly belongs to one feature only, keep it in that feature's `ui/` — but say in
its module docstring which shared component you considered and why it did not fit. That
sentence is what stops the next person re-litigating it.

## Related

- `../hooks/CLAUDE.md` — the shared hook vocabulary (the same rule applies)
- `docs/development/ui-patterns.md` — layout mechanics, the Spectrum `Flex` 450px trap
- `docs/development/styling-guide.md` — CSS architecture, `cn()`, token utilities
- `.claude/skills/spectrum-webview-ui` — the load-bearing Spectrum/webview gotchas
