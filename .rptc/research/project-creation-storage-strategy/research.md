# Research Report: Project Creation Workflow & Storage Strategy

**Research Date:** 2025-11-29
**Research Scope:** Hybrid (Codebase + Web)
**Research Depth:** Comprehensive

---

## Executive Summary

**Good news:** Your project creation workflow is **robust and well-designed**. All async operations are properly awaited, error handling with cleanup is comprehensive, and state is transactional. The codebase analysis found **no critical gaps** in the folder creation or persistence flow.

**For storage strategy:** Your current approach (JSON files + file system) **aligns with VS Code best practices** and matches how the most successful extensions (GitLens 40M+, Project Manager 10M+) handle project storage. SQLite is viable but adds complexity without significant benefit for your use case.

---

## Part 1: Codebase Analysis Findings

### Project Creation Flow - Step by Step

```
User clicks "Create Project"
       ↓
[createProject.ts] Registers command, creates webview
       ↓
[createHandler.ts:28] handleCreateProject()
  • Validates project name (line 42)
  • Checks for duplicates (line 67-88)
       ↓
[executor.ts:83] executeProjectCreation()
       ↓
Step 1 (Line 159): await fs.mkdir(projectPath)  ← FOLDER CREATED HERE
  • Also creates components/ and logs/ subdirs
       ↓
Step 2 (Line 169): Creates Project object in memory
       ↓
Steps 3-4 (Lines 194-260): Component installation
  • Each component: git clone → npm install → generateEnvFile
  • await stateManager.saveProject(project) AFTER EACH ← INTERMEDIATE SAVES
       ↓
Step 5 (Line 268): Mesh deployment (if selected)
  • await stateManager.saveProject(project) ← MESH STATE SAVED
       ↓
Step 6 (Line 391): await fs.writeFile(.demo-builder.json) ← MANIFEST CREATED
       ↓
Step 7 (Line 446): project.status = 'ready'
  • await stateManager.saveProject(project) ← FINAL STATE SAVE
       ↓
Step 8 (Line 467): await sendMessage('creationComplete')
       ↓
Project creation complete ✅
```

### Storage Mechanism - Dual Layer Strategy

| Layer | File | Purpose |
|-------|------|---------|
| **Global State** | `~/.demo-builder/state.json` | Current project reference, process info |
| **Project Manifest** | `~/.demo-builder/projects/{name}/.demo-builder.json` | Complete project snapshot |
| **Root .env** | `~/.demo-builder/projects/{name}/.env` | Commerce URL, API keys |

### Key Finding: saveProject() Is Transactional

```typescript
// stateManager.ts:131-140
async saveProject(project: Project): Promise<void> {
    this.state.currentProject = project;      // 1. Update memory
    await this.saveState();                    // 2. Save state.json
    await this.saveProjectConfig(project);    // 3. Save manifest + .env
    this._onProjectChanged.fire(project);     // 4. Event AFTER persistence
}
```

**All writes are sequential and awaited** - event fires only after ALL files persisted.

### Error Recovery - Cleanup on Failure

```typescript
// createHandler.ts:156-162 - Error handler
if (fs.existsSync(projectPath)) {
    await fsPromises.rm(projectPath, { recursive: true, force: true });
}
```

**If ANY step fails**, the entire project folder is deleted. This is proper transactional behavior.

### Potential Issues Found (Minor)

| Issue | Severity | Location | Impact |
|-------|----------|----------|--------|
| Mesh cleanup inconsistency | Medium | createHandler.ts:167-189 | Mesh may not be deleted on certain error paths |
| Silent DNS failures in mesh describe | Medium | executor.ts:290-312 | Endpoint unknown but deploy succeeded |
| Component metadata not fully reconstructed | Low | stateManager.ts:370-394 | Sidebar shows incomplete info after reload |

### Verdict: Codebase Is Solid ✅

- All `fs.mkdir()`, `fs.writeFile()` calls properly awaited
- All `stateManager.saveProject()` calls properly awaited
- Errors thrown and caught at handler level
- Cleanup runs on any failure before persistence
- Event system notifies AFTER persistence complete

---

## Part 2: Web Research Findings

### VS Code Storage Options Comparison

| Method | Size Limit | Settings Sync | Best For |
|--------|------------|---------------|----------|
| **globalState** | ~100KB recommended | Yes (selective) | Small preferences, dismissed states |
| **workspaceState** | ~100KB recommended | No | Workspace-specific temp state |
| **globalStorageUri** (files) | Disk limit | No | Large data, databases, complex JSON |
| **storageUri** (files) | Disk limit | No | Workspace cache, temporary files |
| **secrets** | Small values | No | Tokens, API keys, passwords |

### Critical Performance Warning

> "Extensions storing >1-3MB in globalState cause **300ms UI stalls across ALL VS Code windows**"
> — [Microsoft/vscode Issue #163446](https://github.com/microsoft/vscode/issues/163446)

The GitHub Pull Requests extension had to migrate large data from globalState to files to fix this.

### How Popular Extensions Handle Storage

| Extension | Installs | Storage Strategy |
|-----------|----------|------------------|
| **Project Manager** | 10M+ | JSON file (`projects.json`) in user settings dir |
| **GitLens** | 40M+ | Storage abstraction, globalState for small prefs only |
| **Thunder Client** | Popular | NeDB for local, workspace folder for team sharing |
| **REST Client** | Popular | Files for history, settings.json for config |

**Key pattern:** All use **JSON files for complex data**, globalState only for small preferences.

### SQLite in VS Code Extensions

| Option | Pros | Cons |
|--------|------|------|
| **sql.js (WASM)** | Cross-platform, no native deps | ~1MB overhead, manual persistence |
| **better-sqlite3** | Fast, native | Platform-specific builds, maintenance burden |
| **@vscode/sqlite3** | Official MS package | Complex integration, not documented for extensions |

**Industry consensus:** SQLite is viable via sql.js but **rarely needed** for project management. JSON files work well for most use cases.

### Best Practices Summary

1. **Use globalState only for small UI state** (<100KB total)
2. **Use file-based storage for complex data** via `globalStorageUri`
3. **Use SecretStorage for tokens** (you're already doing this ✅)
4. **Use workspace.fs API** instead of Node.js fs for remote compatibility
5. **Enable Settings Sync selectively** for appropriate preferences
6. **Implement atomic writes** (write-then-rename pattern)

---

## Part 3: Comparison & Gap Analysis

### What You're Doing Well ✅

| Practice | Your Implementation | Industry Best Practice |
|----------|---------------------|------------------------|
| Complex data in files | `.demo-builder.json` manifest | JSON files recommended |
| Transactional saves | Sequential await + cleanup | Matches industry |
| Dual-layer storage | state.json + manifest | Similar to GitLens pattern |
| Event-driven refresh | `onProjectChanged` event | Standard pattern |
| Error recovery | Folder deletion on failure | Proper cleanup |

### Potential Gaps

| Gap | Impact | Recommendation |
|-----|--------|----------------|
| **Node.js fs instead of workspace.fs** | Won't work in Remote SSH/Codespaces | Consider migration for remote support |
| **No atomic write pattern** | Potential corruption on crash | Implement write-then-rename |
| **globalState size not monitored** | Possible performance issue at scale | Audit current usage |

### Your Storage Location: `~/.demo-builder/`

**Pros:**
- User-visible and backupable
- Independent of VS Code storage lifecycle
- Easy to debug and inspect

**Cons:**
- Not using VS Code's `globalStorageUri` (the recommended path)
- Won't work with VS Code's storage migration tools
- May conflict with other Adobe tools using similar paths

---

## Part 4: Implementation Options

### Option A: Keep Current Approach (Recommended)

**Description:** Continue using `~/.demo-builder/` with JSON files

**Pros:**
- Already working well
- Matches industry patterns
- User-visible for debugging
- No migration needed

**Cons:**
- Not using official VS Code storage paths
- Manual cleanup if extension uninstalled

**Effort:** None

---

### Option B: Migrate to VS Code globalStorageUri

**Description:** Move storage to VS Code's managed location (`~/.vscode/extensions/publisher.extension/globalStorage/`)

**Pros:**
- Official VS Code pattern
- Cleaner lifecycle management
- Better remote workspace support

**Cons:**
- Migration effort
- Less user-visible
- Requires using `workspace.fs` API

**Effort:** Medium (1-2 days)

---

### Option C: Add SQLite for Query Capabilities

**Description:** Use sql.js for complex queries on project data

**Pros:**
- Faster filtering/sorting of large project lists
- Date-based queries
- Relational data support

**Cons:**
- ~1MB WASM overhead
- Additional complexity
- Manual persistence to disk
- Overkill for typical project counts (<50)

**Effort:** High (3-5 days)

**Verdict:** **Not recommended** unless you expect 100+ projects with complex filtering needs

---

### Option D: Hybrid Approach

**Description:** Keep files for persistence, add globalState for UI preferences

**Pros:**
- Best of both worlds
- Settings Sync for preferences
- Files for complex data

**Cons:**
- Two storage mechanisms to maintain

**Effort:** Low-Medium (1 day)

---

## Part 5: Root Cause Analysis - "Projects Not Being Saved"

Based on the codebase analysis, the project creation workflow is **correctly implemented**. However, here are possible explanations for observed issues:

### Hypothesis 1: User Expectation Mismatch
- Projects ARE saved to `~/.demo-builder/projects/`
- Users may be looking in the wrong location

### Hypothesis 2: Error Swallowed Before Save
- If error occurs BEFORE line 163 (`fs.mkdir`), no folder created
- Check logs for validation failures (duplicate name, invalid characters)

### Hypothesis 3: VS Code Restart Race
- On VS Code restart, `getCurrentProject()` reloads from manifest
- If manifest doesn't exist (creation failed), project appears "lost"

### Hypothesis 4: Mesh Deployment Failure
- If mesh deploy fails, error handler cleans up folder
- Project "disappears" even though folder was created

### Recommended Debugging Steps

1. **Check logs** for errors during creation
2. **Verify folder exists** at `~/.demo-builder/projects/{projectName}/`
3. **Check manifest** at `{projectPath}/.demo-builder.json`
4. **Check state.json** at `~/.demo-builder/state.json`

---

## Key Takeaways

1. **Your project creation workflow is solid** - all async operations properly awaited, error handling comprehensive

2. **Your storage approach matches industry best practices** - JSON files for complex data is exactly what successful extensions do

3. **SQLite is overkill** for your use case - adds complexity without significant benefit

4. **Minor improvements possible:**
   - Add atomic write pattern for crash safety
   - Consider `workspace.fs` for remote support
   - Monitor globalState size

5. **If projects "disappear"**, investigate:
   - Mesh deployment failures (cleanup deletes folder)
   - Validation errors before folder creation
   - User looking in wrong location

---

## Sources

### Official VS Code Sources
1. Microsoft - [Common Capabilities | VS Code Extension API](https://code.visualstudio.com/api/extension-capabilities/common-capabilities)
2. Microsoft - [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api)
3. Microsoft - [Settings Sync Documentation](https://code.visualstudio.com/docs/configure/settings-sync)
4. Microsoft - [Remote Development Extensions](https://code.visualstudio.com/api/advanced-topics/remote-extensions)

### GitHub Issues/Discussions
1. Microsoft - [globalState Performance Issue #163446](https://github.com/microsoft/vscode/issues/163446)
2. Microsoft - [Settings Sync Rate Limiting #106206](https://github.com/microsoft/vscode/issues/106206)
3. Microsoft - [SQLite in Extensions Discussion #16](https://github.com/microsoft/vscode-discussions/discussions/16)

### Extension Repositories
1. GitKraken - [vscode-gitlens](https://github.com/gitkraken/vscode-gitlens)
2. alefragnani - [vscode-project-manager](https://github.com/alefragnani/vscode-project-manager)
3. Huachao - [vscode-restclient](https://github.com/Huachao/vscode-restclient)
4. Thunder Client - [thunder-client-support](https://github.com/thunderclient/thunder-client-support)

### Community/Expert Sources
1. Elio Struyf - [VS Code Extension Storage Options](https://www.eliostruyf.com/devhack-code-extension-storage-options/)
2. Krithika Nithyanandam - [VS Code Extension Storage Explained](https://medium.com/@krithikanithyanandam/vs-code-extension-storage-explained-the-what-where-and-how-3a0846a632ea)
3. Matt Reduce - [Exploring VS Code's Global State](https://mattreduce.com/posts/vscode-global-state/)

---

## Codebase Files Referenced

| File | Lines | Purpose |
|------|-------|---------|
| `src/features/project-creation/handlers/createHandler.ts` | 28-231 | Main project creation handler |
| `src/features/project-creation/handlers/executor.ts` | 83-487 | Project execution flow |
| `src/core/state/stateManager.ts` | 28-428 | State persistence and loading |
| `src/features/project-creation/commands/createProject.ts` | - | Command registration |

---

*Research completed: 2025-11-29*
