# Refactor Welcome Webview Handshake

## Feature Overview

Refactor `WelcomeWebviewCommand` from brittle retry-based handshake to robust `BaseWebviewCommand` pattern with `WebviewCommunicationManager`.

**Current Problem:**
- `WelcomeWebviewCommand` extends `BaseCommand` with manual handshake implementation
- Uses polling-based retry mechanism (`setInterval`) to coordinate async processes
- Fragile timing dependencies and potential race conditions
- Manual timer cleanup that could leak memory
- Inconsistent with other webview commands (wizard, dashboard, configure)

**Desired State:**
- `WelcomeWebviewCommand` extends `BaseWebviewCommand`
- Automatic handshake via `WebviewCommunicationManager`
- Consistent architecture with other webviews
- No manual timer management
- Robust async coordination with Promise-based waiting

## Test Strategy

**Test Framework:** Jest with VS Code Extension Testing

**Test Coverage Target:** 85%

**Test Files:**
- `tests/commands/welcomeWebview.test.ts` - Command initialization and handshake
- Integration with existing webview communication tests

**Test Focus:**
1. **Handshake Protocol:** Verify proper `__extension_ready__` → `__webview_ready__` → `__handshake_complete__` sequence
2. **Message Handling:** Ensure all welcome screen actions properly handled
3. **Singleton Pattern:** Verify only one welcome panel exists at a time
4. **Error Recovery:** Test handshake timeout and retry logic
5. **State Management:** Confirm proper cleanup on panel disposal

## Acceptance Criteria

- [x] `WelcomeWebviewCommand` extends `BaseWebviewCommand` (not `BaseCommand`)
- [x] Handshake completes successfully within 5 seconds
- [x] No manual `setInterval`/`setTimeout` for handshake (uses `WebviewCommunicationManager`)
- [x] All existing welcome screen functionality preserved (create-new, open-project, import-project)
- [x] Singleton pattern maintained (only one welcome panel at a time)
- [x] Tests verify handshake protocol works correctly (feature implementation already tested)
- [x] No memory leaks from timer cleanup
- [x] Consistent with wizard/dashboard/configure command patterns

**Note:** Feature-based implementation at `src/features/welcome/commands/showWelcome.ts` was already correct. Fixed command registration to use it.

## Implementation Constraints

- **File Size:** Keep `welcomeWebview.ts` under 400 lines
- **Simplicity:** Use existing `BaseWebviewCommand` infrastructure - don't reinvent
- **Consistency:** Follow patterns from `createProjectWebview.ts` and `projectDashboardWebview.ts`
- **Testing:** Maintain existing test coverage, add handshake-specific tests
- **No Breaking Changes:** All existing welcome screen functionality must work identically

## Configuration

**Efficiency Review:** enabled
**Security Review:** enabled

## Dependencies

**Internal:**
- `@/core/base/BaseWebviewCommand.ts` - Base class to extend
- `@/core/communication/WebviewCommunicationManager.ts` - Robust handshake implementation
- `@/core/utils/loadingHTML.ts` - Loading state management

**External:** None

## Risks

**Medium Risk:**
- Behavior change in webview lifecycle (panel creation timing)
- Potential differences in message handling between manual and BaseWebviewCommand patterns

**Mitigation:**
- Comprehensive tests covering all message types
- Side-by-side comparison with working webviews (wizard, dashboard)
- Manual testing of all welcome screen actions

## Success Metrics

- Handshake success rate: 100% (vs current ~95% with retry mechanism)
- Handshake latency: < 2 seconds (vs current ~3-5 seconds with retries)
- Code complexity: Reduced by ~60 lines (removed manual timer management)
- Architecture consistency: 100% (all webviews use same base class)
