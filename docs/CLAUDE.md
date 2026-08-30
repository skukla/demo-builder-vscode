# Development Strategy

Development principles and conventions for the Adobe Demo Builder extension.
For the documentation index see `docs/README.md`; for architecture see
`docs/architecture/CLAUDE.md`; for source layout see the root `CLAUDE.md` and
`src/CLAUDE.md` (do not duplicate the file tree here).

## Core Principles

### User Experience First
- Every interaction should provide clear feedback
- Loading states must be visible and meaningful
- Error messages should be actionable
- Progressive disclosure of complexity

### Consistent Design Language
- Follow Adobe Spectrum design system
- Maintain visual consistency across all views
- Use established patterns from Adobe products
- Respect platform conventions (VS Code)

## Best Practices

### Webview Development

**Loading states** — always use the centralized utility
(`src/core/utils/loadingHTML.ts`):

```typescript
await setLoadingState(panel, getContent, message, logger);
```

- 100ms delay after panel creation (prevents VS Code default message)
- 1500ms minimum display time (ensures visibility)
- Pure HTML/CSS for initial state (before React loads)

**Component architecture**
- Use React Spectrum components when available
- Create custom components only when necessary
- Keep components focused and composable
- Separate container and presentational components

### State Management

- **Extension state**: `StateManager` (`src/core/state/stateManager.ts`) for
  persistence; keep state minimal and serializable
- **Webview state**: React hooks locally; message passing to the extension;
  no direct file system access; handle disconnection gracefully
- **Dependent state**: when a parent selection changes, clear all dependent
  state (child data, selections) to avoid stale mixed states
- Details and patterns: `docs/patterns/state-management.md`,
  `docs/architecture/state-ownership.md`

### Error Handling

- User-facing errors: clear message, actionable suggestion, log details for
  debugging, never expose sensitive information
- Development: TypeScript strict mode, runtime validation for external data,
  React error boundaries
- Details: `docs/architecture/error-handling.md`, `docs/systems/error-logging.md`

### Concurrency and Logging

- Race-condition patterns (handshake protocol, command queuing, smart
  polling): `docs/systems/race-conditions.md`
- Logging architecture: `docs/systems/logging-system.md`

## Naming Conventions

- Commands: `camelCase` (e.g., `createProject`)
- Components: `PascalCase` (e.g., `WizardContainer`)
- Utilities: `camelCase` (e.g., `loadingHTML`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `MIN_DISPLAY_TIME`)
- Files: `camelCase` or `PascalCase` matching export

## Testing

The project has a large automated Jest suite (~1,130 suites) — see
`tests/README.md` for organization, run commands, coverage, and how to write
new tests. Never pipe jest output through `tail`/`head`/`grep`; redirect to a
file instead.

Manual smoke checks for webview changes:
- Webview loads without the "Initializing" message; spinner visible
- Wizard step navigation, Cancel/Back work
- Theme changes handled (test light and dark)
- Error states display correctly; message passing works both ways

## Performance

- Separate bundles per entry point; minimize bundle size (esbuild)
- Lazy load heavy components; virtualize long lists
- Debounce user input; cache expensive computations

## Security

- Never log sensitive information
- Use VS Code Secret Storage for credentials
- Validate all external input; sanitize user-generated content
- Maintain strict CSP for webviews: nonces for inline scripts, no `eval()`
- This repo is public: no secrets, internal URLs, or PII in code or history

## Release Process

- Update version in `package.json` and `docs/CHANGELOG.md`
- Run the full test suite, `npm run lint`, and `tsc --noEmit` (CI lints the
  whole repo)
- Package with `npm run package`; distribute via GitHub Releases (the
  auto-update system picks releases up)

## Contributing

- Conventional commit messages; small, atomic commits
- Follow established patterns; update relevant documentation with the change
- Code review: edge cases handled, width inheritance tested in layouts,
  dependent state cleared appropriately

## Resources

- `docs/README.md` — documentation index
- `README.md` (repo root) — user-facing documentation
- [VS Code Extension API](https://code.visualstudio.com/api)
- [React Spectrum](https://react-spectrum.adobe.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
