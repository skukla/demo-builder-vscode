# Webview loading

A webview panel exists before its JavaScript does. Between those two moments VS Code
shows its own placeholder, which reads as the extension having hung.

## Why the loading state is plain HTML, not React

React cannot render the loading state, because React is what has not loaded yet. The
placeholder is hand-written HTML and CSS injected into the panel at creation, and it
is replaced when the bundle takes over.

That constraint is the whole design. Anything requiring the bundle — a Spectrum
spinner, a themed component — is unavailable at exactly the moment it is needed.

## Two timings, both deliberate

| | |
|---|---|
| `TIMEOUTS.UI.UPDATE_DELAY` (100ms) | before injecting, so VS Code's own placeholder never appears |
| `TIMEOUTS.UI.MIN_LOADING` (1500ms) | minimum the state stays up |

The minimum is the counter-intuitive one: **a spinner that flashes for 80ms is worse
than no spinner.** The eye registers a flicker as a glitch rather than as progress,
so a fast load is deliberately held.

Use `setLoadingState(panel, getContent, message, logger)` from
`@/core/utils/loadingHTML` rather than writing the sequence again — the ordering and
both timings live in it.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Time values come from
`TIMEOUTS`, never a literal — a bare `1500` here would say nothing about why.
