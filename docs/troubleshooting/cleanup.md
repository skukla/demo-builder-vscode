# Manual Cleanup Guide

This guide explains how to manually clean up Demo Builder projects and data if needed.

## Automatic Cleanup (Preferred)

Demo Builder now handles cleanup automatically in these scenarios:

1. **Pre-flight Check**: Before creating a project, checks if directory exists and cleans it up
2. **Failure Cleanup**: If project creation fails, automatically removes partial project data
3. **Retry Support**: You can retry project creation immediately without manual intervention

**You rarely need to manually clean up!**

---

## Manual Cleanup Options

### Option 1: Delete Specific Project (Command Line)

If you need to manually remove a specific project:

```bash
# Replace "my-commerce-demo" with your project name
rm -rf ~/.demo-builder/projects/my-commerce-demo
```

**Location**: `~/.demo-builder/projects/<project-name>/`

**What's inside**:
- `components/` - Cloned Git repositories
- `logs/` - Project-specific logs
- `.env` - Environment configuration
- `.demo-builder.json` - Project manifest

---

### Option 2: Delete All Projects

To remove all projects but keep extension settings:

```bash
rm -rf ~/.demo-builder/projects
```

---

### Option 3: Reset Everything (Development Mode Only)

Demo Builder includes a **Reset All** command that:
- ✅ Deletes all projects
- ✅ Clears VSCode workspace state
- ✅ Removes stored secrets (license key)
- ✅ Resets status bar
- ✅ Stops running processes

**To use**:
1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type: `Demo Builder: Reset All`
3. Confirm the action
4. Reload VSCode window

**⚠️ This command is only available in development mode** (when running the extension from source).

---

## What Gets Cleaned Up Automatically

### On Project Creation Failure

When project creation fails (timeout, cancellation, error):
```typescript
// Automatically removes:
~/.demo-builder/projects/<project-name>/
```

### On Project Creation Retry

When you retry creating a project with an existing name:
```typescript
// Pre-flight check automatically:
1. Detects existing directory
2. Counts files inside
3. Removes directory if not empty
4. Proceeds with fresh creation
```

**You'll see**: "Preparing Project" → "Removing existing project data..."

---

## Directory Structure

```
~/.demo-builder/
├── projects/
│   ├── my-commerce-demo/
│   │   ├── components/
│   │   │   ├── citisignal-nextjs/       # Frontend (Git clone)
│   │   │   ├── commerce-mesh/            # API Mesh (Git clone)
│   │   │   └── demo-inspector/           # Dependency (Git clone)
│   │   ├── logs/
│   │   ├── .env                          # Environment vars
│   │   └── .demo-builder.json            # Project manifest
│   └── another-project/
│       └── ...
└── state.json                            # Extension state
```

---

## When to Manually Clean Up

You **rarely** need to manually clean up, but it might be useful if:

1. **Disk Space**: You want to reclaim disk space from old projects
2. **Corruption**: A project's files were manually edited and are now corrupted
3. **Testing**: You're testing the extension and want a completely clean slate
4. **Migration**: You're moving to a new machine and don't need old projects

---

## Troubleshooting

### "Directory already exists" Error

**Symptom**: Git clone fails with "destination path already exists and is not empty"

**Solution**: This should never happen now! The pre-flight check handles it.

If you still see this error:
1. Check logs: `Demo Builder: Logs` output channel
2. Look for: `[Project Creation] Found X existing files/folders, cleaning up...`
3. If cleanup failed, manually remove: `rm -rf ~/.demo-builder/projects/<name>`

---

### Projects Not Appearing in Sidebar

**Symptom**: Created projects don't show in "Current Projects" sidebar

**Solution**: Projects are tracked in extension state, not just filesystem.

To rescan:
1. Reload VSCode: `Cmd+Shift+P` → "Developer: Reload Window"
2. Or restart VSCode

---

### Disk Space Full

**Symptom**: Running out of disk space from many projects

**Solution**: Each project is typically 100-500MB (depending on components).

To clean up:
```bash
# See size of all projects
du -sh ~/.demo-builder/projects/*

# Remove specific projects
rm -rf ~/.demo-builder/projects/old-demo-1
rm -rf ~/.demo-builder/projects/old-demo-2

# Or remove all projects
rm -rf ~/.demo-builder/projects
```

---

## FAQ

**Q: Will Demo Builder ever cleanup my projects automatically?**
A: Only in these cases:
- When project creation fails (the partial project)
- When you retry a project with the same name (the existing one)
- Never cleans up successfully created projects

**Q: How do I "uninstall" a project?**
A: Currently, manual deletion via command line. Future versions may add a "Delete Project" command in the UI.

**Q: What happens if I manually delete a project folder?**
A: Demo Builder will still track it in state. You'll see it in the sidebar but can't interact with it. Use "Reset All" (dev mode) or reload VSCode to clear stale state.

**Q: Can I move a project to a different location?**
A: Not currently supported. Projects must be in `~/.demo-builder/projects/<name>`. Moving them manually will break the extension's tracking.

---

## Related Documentation

- [Troubleshooting Guide](../troubleshooting.md)
- [Error Logging System](../systems/error-logging.md)
- [Project Structure](../architecture/overview.md)

