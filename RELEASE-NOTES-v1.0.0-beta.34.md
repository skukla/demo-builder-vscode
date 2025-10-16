# Release Notes - v1.0.0-beta.34

## 🚀 Major Release: Comprehensive Authentication System Refactor

This release represents a complete overhaul of the Adobe authentication system, delivering significant improvements in reliability, performance, and user experience.

## ✨ Key Highlights

### Authentication System Rewrite
- **10-30x faster** project/org/workspace operations via Adobe SDK
- **60-85% reduction** in authentication-related log verbosity
- **Zero unexpected browser launches** during wizard flows
- **Intelligent token caching** prevents redundant checks (30s TTL)
- **Graceful error handling** with clear user feedback

### Performance Improvements
- Auth check time: **9s+ → <1s** (90% faster)
- Token inspection: **~2-3s → <500ms** (80% faster)
- SDK initialization: Automatic and non-blocking
- Eliminated duplicate token validations within operation flows

### User Experience Enhancements
- Clear error messages when sessions expire
- Re-authenticate button appears automatically on auth failures
- No more silent failures or infinite spinners
- Proper loading states for all authentication operations
- Clean, professional notifications (removed all emojis)

## 🔧 Technical Improvements

### Core Authentication Infrastructure
- **New Type System**: `AuthState` enum and `AuthContext` interface for clear state management
- **Standardized Errors**: `AdobeAuthError` class with user-friendly messages
- **Auth Middleware**: `withAuthCheck()` pattern for consistent validation
- **Token Inspection**: Lightweight validation without expensive API calls
- **Context Sync**: Automatic synchronization between CLI state and in-memory cache

### Authentication Manager Overhaul
- Simplified `isAuthenticated()` and `isAuthenticatedQuick()` methods
- Added `getAuthContext()` as central auth state accessor
- New `inspectToken()` and `inspectContext()` for fast, non-blocking checks
- Improved `selectProject()` with 403 error detection
- Removed complex ID resolution logic in favor of direct queries

### Wizard Integration
- Unified `requireAuthContext()` helper centralizes auth validation
- Updated all handlers to use new auth system
- Proper error handling for permission denied (403) scenarios
- Clear feedback on token expiry during project selection

### Node Version Management
- **Explicit configuration** over implicit assumptions
- Infrastructure section in `components.json` for Adobe CLI/SDK requirements
- Per-component Node version declarations
- Filtered prerequisite checks to only scan project-required versions
- Human-readable names in Node version displays

### Logging Improvements
- **77% reduction** in SDK initialization logs (13 → 3 lines)
- **Eliminated duplicate** debug/info log pairs
- Added command context to Node version logs: `(Node v18) aio config get...`
- Removed redundant error logging
- Cleaner notification style without emojis

## 🐛 Bug Fixes

### Authentication
- Fixed infinite loop in `syncContextFromCLI()` when cache is empty
- Resolved duplicate token inspections across wizard steps
- Prevented unexpected browser launches during auth checks
- Fixed 403 permission denied errors showing no UI feedback
- Corrected org ID placeholder issues (name vs numeric ID)

### Validation
- Fixed project name validation inconsistencies in wizard
- Resolved checkmark disappearing unexpectedly
- Added duplicate name checking in CLI project creation

### Updates
- Prevented duplicate update check immediately after extension installation
- Fixed hanging "Installing..." notification on successful updates

## 📊 Performance Metrics

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Auth Check | 9s+ | <1s | 90% faster |
| Token Inspection | 2-3s | <500ms | 80% faster |
| Project Fetch (SDK) | ~3s (CLI) | ~200ms (SDK) | 15x faster |
| Org Fetch (SDK) | ~3s (CLI) | ~300ms (SDK) | 10x faster |
| Log Verbosity | Baseline | -60-85% | Much cleaner |

## 🔄 Breaking Changes

None for end users. Internal API changes:
- Removed `@adobe/aio-lib-ims` dependency (getToken caused browser issues)
- Simplified auth method signatures (removed skipIdLookup parameters)
- All auth operations now throw `AdobeAuthError` for consistent handling

## 🎯 What's Next

This authentication refactor lays the groundwork for:
- More reliable multi-org workflows
- Better session persistence across extension reloads
- Enhanced error recovery mechanisms
- Future performance optimizations

## 📝 Technical Details

### Commits in this Release
1. `feat: add core authentication infrastructure with typed states and errors`
2. `refactor: comprehensive authentication manager overhaul`
3. `feat: integrate new authentication system in project wizard`
4. `feat: update deployMesh and dashboard with new auth system`
5. `refactor: improve logging clarity and reduce verbosity`
6. `fix: prevent duplicate update check after extension installation`
7. `feat: implement explicit Node version management system`
8. `fix: improve project name validation in wizard and CLI`
9. `chore: remove @adobe/aio-lib-ims dependency`

### Files Changed
- **Authentication Core**: 2 new files, 600+ lines simplified in auth manager
- **Wizard Integration**: 400+ lines refactored
- **Logging**: 4 files optimized for clarity
- **Node Management**: New resolver system, 7 files updated
- **Dependencies**: Removed problematic @adobe/aio-lib-ims

## 🙏 Acknowledgments

This release represents extensive testing and iteration to achieve a reliable, performant authentication system. Special thanks to everyone who provided feedback on authentication issues in previous beta versions.

---

**Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.33...v1.0.0-beta.34

