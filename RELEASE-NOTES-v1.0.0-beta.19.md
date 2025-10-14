# Demo Builder v1.0.0-beta.19 Release Notes

## Critical Fixes

### 🐛 API Mesh Creation Node Version Error
- **Fixed API Mesh creation failing with "Cannot find module 'node:util'" error**
  - API Mesh commands were running under Node 14 with old aio-cli 9.3.0, causing module compatibility errors
  - Changed mesh creation, deletion, and describe commands to use `executeAdobeCLI()` which automatically uses the correct Node version (Node 20/24)
  - This ensures all Adobe CLI commands consistently use the highest available fnm-managed Node version with aio-cli installed
  - **Bonus:** Filters out harmless plugin loading warnings from stderr when commands succeed (cleaner logs!)

### 🔄 Bulletproof Component Update Rollback
- **Eliminated "manual recovery required" failures during component updates**
  - Implemented resilient rollback with 5 retry attempts and exponential backoff
  - Uses `fs.cp()` instead of `fs.rename()` to work across device boundaries
  - Handles file locks gracefully with progressive delays (500ms → 8 seconds)
  - If automatic rollback still fails, UI now shows "Retry Rollback" button for one-click recovery
  
**What this means:** Component updates are now much safer. Even if an update fails and the automatic rollback encounters file locks or permission issues, the system will retry multiple times. If it still fails, you get a button to retry the rollback instead of needing to run manual terminal commands.

## Improvements

### 🎯 Granular Update Control
- **Component and extension updates are now separate**
  - When updates are available, you can choose:
    - "Update All" - Update both components and extension (reload required)
    - "Components Only" - Update just components (no reload)
    - "Extension Only" - Update just the extension (reload required)
  - No more forced reloads when you only want to update components
  - Update components now, extension later (or vice versa)

### ⚡ Enhanced Deploy Mesh Feedback
- Added immediate status update and spinning status bar message when clicking "Deploy Mesh"
- Eliminates the 3-5 second delay before users see deployment feedback (caused by authentication checks)

## Previous Fixes (v1.0.0-beta.18)
- Fixed component version showing "vunknown" for newly created projects
- Fixed API Mesh status showing "Not deployed" on dashboard load
- Shortened mesh deployment error notifications with "View Logs" button
- Interactive Homebrew installation in terminal for better user experience
- Git prerequisite now accepts any installed Git version

---

**Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.18...v1.0.0-beta.19

