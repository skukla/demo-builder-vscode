# Demo Builder v1.0.0-beta.19 Release Notes

## Critical Fix: API Mesh Creation Node Version

### Bug Fixes
- **Fixed API Mesh creation failing with "Cannot find module 'node:util'" error**
  - API Mesh commands were running under Node 14 with old aio-cli 9.3.0, causing module compatibility errors
  - Changed mesh creation, deletion, and describe commands to use `executeAdobeCLI()` which automatically uses the correct Node version (Node 20/24)
  - This ensures all Adobe CLI commands consistently use the highest available fnm-managed Node version with aio-cli installed

### Improvements
- **Enhanced Deploy Mesh feedback**
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

