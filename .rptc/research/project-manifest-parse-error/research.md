# Research: Project Manifest Parse Error

**Date:** 2026-01-08
**Topic:** Extension polling error - "Failed to parse project manifest"
**Scope:** Codebase analysis

---

## Summary

The error "Failed to parse project manifest" is caused by a **corrupted `.demo-builder.json` manifest file**. The JSON file has garbage data appended to it, making it unparseable.

---

## Root Cause Analysis

### 1. Corrupted Manifest File

The project manifest at `/Users/kukla/.demo-builder/projects/my-commerce-demo/.demo-builder.json` has corrupted data at the end:

```json
  "selectedStack": "eds-paas"
}l",
  "selectedStack": "eds-paas"
}
```

The `}l",` followed by duplicate `"selectedStack"` makes the JSON invalid.

### 2. Why It Loads Multiple Times (3 errors)

The Projects Dashboard calls `getProjects` which:
- `src/features/projects-dashboard/handlers/dashboardHandlers.ts:38-47` loops through all projects
- Each project path gets loaded via `stateManager.loadProjectFromPath()`
- `src/core/state/projectFileLoader.ts:56-59` parses the JSON and throws when invalid

The 3 rapid errors suggest the dashboard loaded 3 times in quick succession (possibly from: initial load, config change listener, or webview recreation).

### 3. Error Flow

```
projectFileLoader.ts:56 → parseJSON(manifestData)
  ↓
typeGuards.ts:44-45 → JSON.parse() fails, returns null
  ↓
projectFileLoader.ts:57-58 → if (!manifest) throw Error('Failed to parse project manifest')
  ↓
projectFileLoader.ts:99 → logger.error('Failed to load project from...')
```

---

## Relevant Files

| File | Purpose | Line(s) |
|------|---------|---------|
| `src/core/state/projectFileLoader.ts` | Loads project manifests | 56-59 (error thrown) |
| `src/types/typeGuards.ts` | Safe JSON parsing | 44-52 (parseJSON) |
| `src/features/projects-dashboard/handlers/dashboardHandlers.ts` | Loads all projects | 38-47 (loop) |
| `src/core/state/projectConfigWriter.ts` | Writes manifest files | (may be source of corruption) |

---

## Key Code Sections

### ProjectFileLoader - Error Location

```typescript
// src/core/state/projectFileLoader.ts:54-59
// Load project manifest
const manifestData = await fs.readFile(manifestPath, 'utf-8');
const manifest = parseJSON<ProjectManifest>(manifestData);
if (!manifest) {
    throw new Error('Failed to parse project manifest');
}
```

### parseJSON - Safe Parsing

```typescript
// src/types/typeGuards.ts:40-53
export function parseJSON<T = unknown>(
    json: string,
    guard?: (value: unknown) => value is T,
): T | null {
    try {
        const parsed = JSON.parse(json);
        if (guard && !guard(parsed)) {
            return null;
        }
        return parsed as T;
    } catch {
        return null;  // Returns null on parse failure
    }
}
```

### Dashboard Handler - Load Loop

```typescript
// src/features/projects-dashboard/handlers/dashboardHandlers.ts:38-47
const projectList = await context.stateManager.getAllProjects();

const projects: Project[] = [];
for (const item of projectList) {
    const project = await context.stateManager.loadProjectFromPath(item.path);
    if (project) {
        projects.push(project);
    }
}
```

---

## Potential Causes of Corruption

1. **Race condition during write** - Two concurrent write operations to the same file
2. **Interrupted write** - Extension crashed or was terminated during save
3. **Buffer issue** - Data wasn't flushed properly before file close

---

## Immediate Fix

### Option A: Fix the corrupted file manually

```bash
# Backup the corrupted file first
cp ~/.demo-builder/projects/my-commerce-demo/.demo-builder.json \
   ~/.demo-builder/projects/my-commerce-demo/.demo-builder.json.bak

# Edit the file and remove the garbage at the end
# The file should end with:
#   "selectedStack": "eds-paas"
# }
```

### Option B: Delete and recreate the project

If the project isn't critical, delete the project directory and recreate it through the wizard.

---

## Code Improvement Recommendations

### Option 1: Add JSON validation before write (prevent corruption)

In `projectConfigWriter.ts`, validate JSON can be parsed before writing:

```typescript
const jsonString = JSON.stringify(data, null, 2);
// Verify it can be parsed back
JSON.parse(jsonString);
await fs.writeFile(manifestPath, jsonString);
```

### Option 2: Add JSON repair on load (recover from corruption)

Try to detect and repair common JSON corruption patterns:

```typescript
if (!manifest) {
    // Try to repair common corruption patterns
    const repaired = attemptJsonRepair(manifestData);
    if (repaired) {
        manifest = parseJSON<ProjectManifest>(repaired);
    }
}
```

### Option 3: Add atomic write (prevent corruption)

Write to temp file first, then rename (atomic operation):

```typescript
const tempPath = `${manifestPath}.tmp`;
await fs.writeFile(tempPath, jsonString);
await fs.rename(tempPath, manifestPath);  // Atomic on most filesystems
```

---

## Architecture Context

The project loading flow:

```
Extension Activation
  ↓
ShowProjectsListCommand.execute()
  ↓
handleGetProjects() [dashboardHandlers.ts]
  ↓
stateManager.getAllProjects() → ProjectDirectoryScanner
  ↓
For each project: stateManager.loadProjectFromPath()
  ↓
ProjectFileLoader.loadProject()
  ↓
fs.readFile('.demo-builder.json')
  ↓
parseJSON() → FAILS if JSON corrupted
  ↓
Error logged, project skipped
```

---

## Related Documentation

- `src/core/state/README.md` - State management overview
- `src/core/CLAUDE.md` - Core infrastructure documentation
- `src/features/projects-dashboard/CLAUDE.md` - Projects dashboard documentation

---

*Research conducted: 2026-01-08*
