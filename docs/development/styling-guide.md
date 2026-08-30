# Styling

How to style a React Spectrum component inside a VS Code webview.

**The architecture is [ADR-018](../architecture/adr/018-css-architecture.md)** —
cascade layers, where a class is allowed to live, why `!important` is not a
mechanism, and what the build enforces. Read it once. This guide is the practical
half and deliberately does not restate any of it.

## Where the stylesheets are

`src/core/ui/styles/` — `reset.css`, `tokens.css`, `custom-spectrum.css`,
`vscode-theme.css`, `wizard.css`, and `index.css` which imports them. A few
features carry their own sheet beside their UI (`data-installer`, `eds`).

**A feature stylesheet reaches only the bundles whose entry imports it.** There are
eight bundles, so a class can be styled on one surface and simply absent on the
next, with no error anywhere. That is the single most common styling surprise here.

## `UNSAFE_className`, and why it is the supported path

React Spectrum does not expose a plain `className`, by design — it wants control of
its own design system. `UNSAFE_className` is Spectrum's official escape hatch, and
the "unsafe" is a discouragement rather than a warning: for a webview that has to
match the editor's theme, it is the intended tool.

Compose classes with `cn()` from `@/core/ui/utils/classNames`:

```tsx
<View UNSAFE_className={cn('flex', 'flex-column', isActive && 'is-active')} />
```

`cn` drops falsy values, so a conditional class needs no ternary.

## Which classes exist

**Read the stylesheet — this guide does not list them.** It used to, and the list
rotted: it advertised `text-medium`, which is defined in no stylesheet at all, in
two separate worked examples.

```bash
grep -rn "^\.your-class" src/core/ui/styles/
```

ADR-018 §4 requires that a class a component uses is defined somewhere, and the
build checks it — so an invented class fails rather than silently rendering
unstyled. Trust that check rather than a catalogue in prose.

## Spectrum size tokens for dimensions

`translateSpectrumToken()` in `@/core/ui/utils/spectrumTokens` converts a Spectrum
token to a pixel value, and `DimensionValue` types a prop so an invalid token is a
compile error rather than a silent no-op:

```tsx
gap: translateSpectrumToken('size-300')   // "24px"
gap: translateSpectrumToken('24px')       // passes through
gap: translateSpectrumToken(24)           // "24px"
gap: translateSpectrumToken(undefined)    // undefined — an optional prop stays optional
```

The supported set is whatever that file maps; read it rather than trusting a number
here. This guide previously said thirteen tokens when there were thirty.

**Tokens for dimensions, classes for appearance.** Gap, padding and width
constraints want tokens, because those are the values that must agree with
Spectrum. Colour, border, typography and state want classes.

## Theming

VS Code variables (`--vscode-editor-background`, `--vscode-widget-border`) and
Spectrum globals both adapt to the active theme, so a component built from them
follows the user's editor without a light/dark branch in the component.

Check a change in both a light and a dark theme before calling it done — a border
that reads correctly on one ground frequently disappears on the other, which is why
dark-mode borders here tend to use a translucent white rather than a fixed grey.

## Related

- [ADR-018](../architecture/adr/018-css-architecture.md) — the architecture and
  what the build enforces
- [ADR-017](../architecture/adr/017-webview-architecture.md) — the webview runtime
  these styles load into
- `spectrum-webview-ui` skill — the load-bearing layout traps, including the
  Spectrum `Flex` 450px width constraint
- `webview-visual-baseline` skill — prove a CSS change moved exactly what it meant
  to, by computed-style fingerprint across all eight surfaces
- [`../../src/core/ui/components/CLAUDE.md`](../../src/core/ui/components/CLAUDE.md)
  — pick an existing component before styling a new one
