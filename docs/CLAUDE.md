# Development Strategy

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
- Respect platform conventions (VSCode)

## Best Practices

### Webview Development

#### Loading States
Always use the centralized loading utility for webviews:
```typescript
await setLoadingState(panel, getContent, message, logger);
```

**Key Requirements:**
- 100ms delay after panel creation (prevents VSCode default message)
- 1500ms minimum display time (ensures visibility)
- Pure HTML/CSS for initial state (before React loads)

#### Component Architecture
- Use React Spectrum components when available
- Create custom components only when necessary
- Keep components focused and composable
- Separate container and presentational components

### State Management

#### Extension State
- Use `StateManager` for persistence
- Keep state minimal and serializable
- Handle state migrations for updates
- Document state shape changes

#### Webview State
- Use React hooks for local state
- Message passing for extension communication
- No direct file system access
- Handle disconnection gracefully

### Error Handling

#### User-Facing Errors
- Provide clear error messages
- Suggest actionable solutions
- Log details for debugging
- Never expose sensitive information

#### Development Errors
- Use TypeScript strict mode
- Add runtime validation for external data
- Implement error boundaries in React
- Monitor console for warnings

## Code Organization

### File Structure
```
src/
├── commands/        # VSCode command implementations
├── utils/          # Shared utilities
├── webviews/       # React applications
│   ├── components/ # Reusable components
│   └── styles/     # CSS modules
└── types/          # TypeScript definitions
```

### Naming Conventions
- Commands: `camelCase` (e.g., `createProject`)
- Components: `PascalCase` (e.g., `WizardContainer`)
- Utilities: `camelCase` (e.g., `loadingHTML`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `MIN_DISPLAY_TIME`)
- Files: `camelCase` or `PascalCase` matching export

## Testing Strategy

### Manual Testing Checklist
- [ ] Webview loads without "Initializing" message
- [ ] Loading spinner visible for full duration
- [ ] Navigation between wizard steps works
- [ ] Cancel/Back buttons function correctly
- [ ] Theme changes handled properly
- [ ] Error states display correctly
- [ ] Message passing works bidirectionally

### Automated Testing (Future)
- Unit tests for utilities
- Integration tests for commands
- Component tests for React
- E2E tests for critical paths

## Performance Considerations

### Bundle Optimization
- Separate bundles for different entry points
- Code splitting for large components
- Tree shaking for unused code
- Minimize bundle size

### Runtime Performance
- Lazy load heavy components
- Virtualize long lists
- Debounce user input
- Cache expensive computations

## Security Guidelines

### Data Handling
- Never log sensitive information
- Use VSCode Secret Storage for credentials
- Validate all external input
- Sanitize user-generated content

### Content Security Policy
- Maintain strict CSP for webviews
- Use nonces for inline scripts
- Avoid eval() and similar patterns
- Review third-party dependencies

## Release Process

### Pre-Release Checklist
- [ ] Update version in package.json
- [ ] Update CHANGELOG.md
- [ ] Run full test suite
- [ ] Test on multiple platforms
- [ ] Update documentation
- [ ] Review security implications

### Post-Release
- Monitor error reports
- Gather user feedback
- Plan next iteration
- Update roadmap

## Future Roadmap

### Short Term (1-2 months)
- Automated testing framework
- Performance monitoring
- Enhanced error reporting
- Accessibility improvements

### Medium Term (3-6 months)
- Advanced project templates
- Team collaboration features
- Cloud synchronization
- Extension marketplace

### Long Term (6+ months)
- AI-powered assistance
- Multi-platform support
- Enterprise features
- API ecosystem

## Lessons Learned

### Adobe Spectrum Component Limitations

#### Width Constraint Issues
- **Problem**: Adobe Spectrum's Flex component constrains child widths to 450px in certain layouts
- **Solution**: Use standard HTML div with flex styles for critical layouts
- **Example**: Replace `<Flex height="100%">` with `<div style={{ display: 'flex', height: '100%', width: '100%' }}>`
- **Why**: Spectrum components apply internal constraints that don't always inherit parent dimensions correctly

#### Component Props vs CSS
- Always prefer component props over CSS for behavior (e.g., `menuWidth` for Picker)
- Use `UNSAFE_className` and `!important` when CSS overrides are necessary
- Some styles require inline `UNSAFE_style` (e.g., cursor on Pickers)

### Debugging Complex Layout Issues

#### Width Debugging Pattern
When encountering width issues, create a WidthDebugger component:
```typescript
function WidthDebugger() {
    // Trace width inheritance through DOM tree
    // Log offsetWidth, clientWidth, computedWidth
    // Identify constraint source
}
```

#### Testing Strategy
1. Test in both light and dark themes
2. Verify with different content lengths
3. Check responsive behavior at various panel sizes
4. Use browser DevTools to inspect computed styles

### Scroll Management in Constrained Containers

#### Container vs Page Scrolling
- Always constrain container height with `max-height`
- Use `overflow-y: auto` for vertical scrolling
- Implement auto-scroll with container.scrollTo(), not window.scrollTo()
- Calculate relative positions for smooth scrolling to items

#### Auto-scroll Implementation
- Track current checking item with refs
- Calculate if item is below visible area
- Scroll just enough to show item at bottom
- Add padding to prevent cutoff

### UI Consistency Patterns

#### Status Display Standardization
- Display multi-value items (versions, plugins) on separate lines
- Use consistent icon placement (right side with margin)
- Parse error messages to extract structured data
- Maintain consistent font sizes for hierarchy

#### Dark Mode Considerations
- Use rgba borders for subtle visibility: `rgba(255, 255, 255, 0.2)`
- Test all color choices in both themes
- Ensure sufficient contrast for readability

### Authentication and Polling Optimization

#### Fast Feedback Loop
- **Problem**: 3-second polling interval created poor UX with 3-10 second waits
- **Solution**: Reduced polling to 1 second for 3x faster response
- **Implementation**: Modified `authPollingInterval` in `createProjectWebview.ts`
- **Impact**: Users see authentication success within 1 second of browser completion

#### Loading State Persistence
- **Problem**: Loading states disappeared due to intermediate status messages
- **Solution**: Track `isLoggingIn` state separately from `isChecking`
- **Pattern**: Only clear loading state when action completes or errors
```typescript
// Don't clear isChecking if actively logging in
isChecking: isLoggingIn ? state.adobeAuth.isChecking : false
```

### Two-Column Layout Pattern

#### When to Use
Complex multi-step configurations where users need to:
- See their current selections while making new ones
- Edit previous choices without losing context
- Understand progress through the workflow

#### Implementation Pattern
```tsx
// Use standard div for proper width inheritance
<div style={{ display: 'flex', height: '100%', width: '100%' }}>
    <div style={{ flex: '1 1 60%' }}>
        {/* Active content */}
    </div>
    <div style={{ flex: '0 0 40%' }}>
        {/* Persistent summary */}
    </div>
</div>
```

#### Key Design Decisions
- **Edit buttons always visible**: Transparency over aesthetics
- **Progressive disclosure**: Reveal complexity gradually
- **Immediate feedback**: Every action shows loading state
- **Context in loading**: Show what's being loaded from where

### Race Condition Solutions

#### The Problem
We experienced numerous race conditions:
- Webview messages sent before React was ready
- Commands executing simultaneously on shared resources
- Adobe CLI state getting out of sync with VS Code
- Brittle setTimeout delays causing intermittent failures

#### The Comprehensive Solution (4-Phase Implementation)

**Phase 1: WebviewCommunicationManager**
- Two-way handshake protocol ensures both sides ready
- Message queuing until handshake completes
- Request-response pattern with unique IDs
- Automatic retry with exponential backoff

```typescript
// Before: Messages could be lost
panel.webview.postMessage({ type: 'init', data });

// After: Messages guaranteed delivery
await communicationManager.sendMessage('init', data);
```

**Phase 2: ExternalCommandManager**
- Command queuing for sequential execution
- Mutual exclusion for resource access
- Smart polling replaces setTimeout delays
- Retry strategies for different failure types

```typescript
// Before: Race conditions with concurrent commands
exec('aio auth login');
exec('aio console org list');

// After: Guaranteed sequential execution
await commandManager.executeExclusive('adobe-cli', async () => {
    await commandManager.executeCommand('aio auth login');
    await commandManager.executeCommand('aio console org list');
});
```

**Phase 3: StateCoordinator**
- Synchronizes Adobe CLI state with VS Code
- Atomic state updates prevent partial changes
- Cache with TTL reduces CLI calls
- State change events for reactive updates

**Phase 4: Migration to New Patterns**
- BaseWebviewCommand for standardized communication
- AdobeAuthManagerV2 using new managers
- Eliminated all setTimeout polling loops

### Configuration-Driven Logging

#### The Problem
- Hardcoded log messages throughout codebase
- Step names didn't match configuration
- Inconsistent message formatting
- Difficult to maintain and update

#### The Solution: StepLogger with Templates

**Configuration-driven step names** (wizard-steps.json):
```json
{
  "id": "adobe-auth",
  "name": "Adobe Setup"  // Used in all logs for this step
}
```

**Template-based messages** (logging.json):
```json
{
  "operations": {
    "fetching": "Fetching {item}..."
  }
}
```

**Smart context switching**:
```typescript
// Wizard step context
stepLogger.log('adobe-auth', 'Checking auth');
// Output: [Adobe Setup] Checking auth

// Operational context
logger.info('[Extension] Checking for updates');
// Output: [Extension] Checking for updates
```

### State Clearing Patterns

#### Dependent State Management
When changing a parent selection, clear all dependent state:
```typescript
// Example: Switching organizations
setProjects([]);        // Clear child data
setWorkspaces([]);      // Clear grandchild data
setSelectedProjectId(null);  // Clear selections
setSelectedWorkspaceId(null);
```

#### Why This Matters
- Prevents showing stale data from previous context
- Ensures clean state for new selections
- Avoids confusing mixed states

## Contributing Guidelines

### Code Review Criteria
- Follows established patterns
- Includes appropriate comments
- Handles edge cases
- Maintains backward compatibility
- Updates relevant documentation
- Tests width inheritance in layouts
- Verifies scroll behavior
- Ensures sub-second feedback for user actions
- Clears dependent state appropriately

### Commit Messages
- Use conventional commits format
- Reference issue numbers
- Keep messages concise
- Group related changes

### Pull Request Process
1. Create feature branch
2. Implement changes
3. Update tests and docs
4. Submit PR with description
5. Address review feedback
6. Merge after approval

## Resources

### Internal Documentation
- `docs/technical.md` - Technical implementation details
- `README.md` - User-facing documentation
- Code comments - Implementation notes

### External Resources
- [VSCode Extension API](https://code.visualstudio.com/api)
- [React Spectrum](https://react-spectrum.adobe.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
- Adobe internal wikis and guides