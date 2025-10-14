# Demo Builder v1.0.0-beta.20 Release Notes

## Critical Fix: Complete Node Version Consistency

### 🐛 Fixed ALL Remaining Node 14 Issues
- **Discovered 4 more `aio` commands running under wrong Node version**
  - `deployMesh.ts`: `aio api-mesh update` was using Node 14
  - `meshVerifier.ts`: `aio api-mesh:describe` was using Node 14
  - `meshDeploymentVerifier.ts`: `aio api-mesh get` and `aio api-mesh:describe` were using Node 14
  
- **All Adobe CLI commands now consistently use Node 20/24**
  - Every single `aio` command now uses `executeAdobeCLI()` method
  - This ensures ALL mesh operations run under the correct Node version
  - **This should fix mesh verification timeouts** caused by Node 14 compatibility issues

### What This Fixes

Your colleague's issue where mesh creation succeeded but verification timed out was likely caused by the verification commands running under Node 14. With all commands now running under the correct Node version, the entire mesh workflow should work smoothly:

1. ✅ Mesh creation (Node 24)
2. ✅ Mesh verification (Node 24) - **FIXED**
3. ✅ Mesh deployment (Node 24)
4. ✅ Mesh updates (Node 24)
5. ✅ Mesh deletion (Node 24)

## Previous Fixes (v1.0.0-beta.19)
- Bulletproof component update rollback with retry logic
- Granular update control (update components/extension separately)
- Fixed API Mesh creation Node version errors
- Enhanced Deploy Mesh feedback

---

**Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.19...v1.0.0-beta.20

