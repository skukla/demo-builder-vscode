# Shared React hooks

The behaviour half of the house vocabulary. `../components/CLAUDE.md` is the visual
half, and the same rule governs both: check here before writing a new one.

Every hook carries full JSDoc with examples — read the source for its API. This file
is the inventory plus the handful of behaviours the source will not tell you.

## What is here

| Hook | Does |
|---|---|
| **Talking to the extension** | |
| `useVSCodeMessage` | Subscribe to extension messages, unsubscribing on unmount |
| `useVSCodeRequest` | Request/response with loading/error/data state — **see the gotcha below before using it** |
| **State** | |
| `useLoadingState` | Loading/error/data, plus `hasLoadedOnce` and `isRefreshing` |
| `useSelection` | Single-item selection with key extraction |
| `useSelectionStep` | A whole wizard selection step (see below) |
| `useAsyncData` | Async fetch wired to VS Code messages; auto-load, auto-select-single |
| `useAsyncOperation` | Run an async operation with `isExecuting`/message/error, safe across unmount |
| `useCanProceed` | Drive the wizard's `canProceed` from a validation value |
| `usePollingWithTimeout` | Poll until a condition holds or a timeout elapses |
| **Interaction** | |
| `useAutoScroll` | Keep items visible in a scrolling container |
| `useSearchFilter` | Filter arrays over configurable fields, memoized |
| `useFocusTrap` | Trap focus within a container (WCAG); exports `FOCUSABLE_SELECTOR` |
| `useFocusOnMount` | Focus on mount, three tiers (see below) |
| `useActivateOnKey` | Enter/Space for a div-role button — the contract every click-to-open tile needs |
| `useArrowKeyNavigation` | Arrow-key list/grid navigation. **No callers today**; kept as a primitive |
| `useEnterExit` | Animate items in and out of a list (see below) |
| **Utility** | |
| `useDebouncedValue` | Debounce any value |
| `useDebouncedLoading` | Show loading only past a delay, so a fast op does not flash |
| `useIsMounted` | Ref guarding setState-after-unmount |
| `useSetToggle` | A `Set` with a memoized toggle, for multi-select |
| `useTimerCleanup` | N timer refs, cleared on unmount |
| `useSelectableDefault` | Select-all-on-focus for fields holding a replaceable default |
| `useVerificationMessage` | Status value → formatted `info`/`success`/`warning`/`error` message |
| `useElapsedStage` | Advance a sub-message as a wait drags, so a slow fetch does not read as frozen |

**Choosing between the three async ones**, which is the question this list gets asked
most: `useAsyncData` fetches data that arrives by VS Code message · `useAsyncOperation`
runs an operation that needs no message plumbing · `useSelectionStep` is an entire
selection step, and is what you want if you are building one.

## `useVSCodeRequest` reports success when the handler REFUSES

The most consequential thing in this directory. The hook rejects only when the request
rejects, and a request rejects only when the handler **throws** — while this project's
convention is that guards RETURN `{ success: false, error, code }`. A refusal therefore
arrives resolved, `error` stays `null`, and `data` holds the envelope rather than your
domain object.

So `useVSCodeRequest<SomeDomainType>` is **typed on a lie**, and reading a domain field
off a refusal yields `undefined` — which renders as a default, not as an error. In
August 2026 a connectivity line read `data.reachable` off a guard refusal and told
signed-out users "Connected" for two steps.

Reach for this hook only against a handler that genuinely throws. Otherwise type the
ENVELOPE and branch on `.success`. The full treatment — why the channel behaves this
way, and the `GitHubAppCheckResult` pattern to copy — is in
[webview-command-handler](../../../../.claude/skills/webview-command-handler/SKILL.md),
which is where you will be when you wire one.

## Three hooks whose contract is not visible in their signature

**`useSelectionStep`** composes a whole wizard step: cached items from a message type,
debounced loading, search, auto-select, and selected-item sync that survives both
hydration (an ID-only import) and an external rename.

Its `onSelect` is where **dependent state gets cleared** — changing the Adobe project
must clear the workspace, or the next operation targets a resource nobody chose:

```tsx
onSelect: (project) => updateState({ adobeProject: project, adobeWorkspace: undefined }),
```

**`useEnterExit`** shares the enter/exit *orchestration* for animated lists, extracted so
the wizard timeline and the sub-step strip agree. It returns removed items re-inserted at
their original positions flagged `isExiting`, and suppresses animation during a
first-mount settle window. **The CSS stays the caller's**: the timeline animates
max-height, the strip max-width. Only the orchestration is shared.

**`useFocusOnMount`** tries immediate, then `requestAnimationFrame`, then a timeout —
because Spectrum components render asynchronously. `MutationObserver` was considered and
rejected: more overhead, and unreliable against React's render cycle.

## Composing them

```tsx
const { data, loading } = useAsyncData<Project[]>({ messageType: 'projects', autoLoad: true });
const { query, setQuery, filteredItems } = useSearchFilter(data ?? [], { searchFields: ['title'] });
const { selectedItem, select } = useSelection<Project>({ getKey: (p) => p.id });
```

For a full wizard step, prefer `useSelectionStep` over hand-composing that.

**Passing an inline `[]` or `{}` into a hook with effect dependencies re-renders
forever** — a fresh literal is a new reference every render. Hoist it to a module-level
constant. This is [ADR-017](../../../../docs/architecture/adr/017-webview-architecture.md)
§5 and it fails the build (`webview-architecture-rules.test.ts`), so it is a rule here
rather than advice.

## Writing one

Cleanup is already handled by the hooks that need it — `useVSCodeMessage` unsubscribes,
`useDebouncedValue` and `useTimerCleanup` clear their timers, `useFocusTrap` removes its
listeners. Memoize any callback you hand to a hook that lands in a dependency array.

Tests mirror this directory under `tests/`. **The react project runs on fake timers**
(`tests/setup/react.ts`), which changes how `userEvent` must be set up — that contract is
in [webview-test-authoring](../../../../.claude/skills/webview-test-authoring/SKILL.md) §1.

Rules of hooks are not restated here: `react-hooks/rules-of-hooks` is an eslint **error**,
so calling one conditionally fails the build rather than this document.
