# File Deletion Reliability Best Practices

**Research Date:** 2025-12-01
**Research Scope:** Hybrid (Codebase + Web)
**Research Depth:** Standard

## Summary

The current implementation is **good but not optimal**. It uses a custom exponential backoff wrapper around `fs.rm()`, but Node.js 14.14+ provides **built-in retry support** that handles the same error codes with less code. There are also a few patterns that could be improved.

---

## Codebase Analysis

### Relevant Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/features/lifecycle/commands/deleteProject.ts` | 141-190 | Custom `deleteWithRetry()` implementation |
| `src/core/utils/timeoutConfig.ts` | 114-115 | `FILE_DELETE_RETRY_BASE` (100ms), `FILE_HANDLE_RELEASE` (500ms) |

### Current Implementation Pattern

```typescript
// Custom retry wrapper approach
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await fs.rm(path, { recursive: true, force: true });
    // Post-deletion verification with fs.access()
    // Exponential backoff on ENOTEMPTY/EBUSY
}
```

### Strengths

- ✅ Exponential backoff (100ms, 200ms, 400ms, 800ms, 1600ms)
- ✅ Handles ENOTEMPTY and EBUSY as retryable
- ✅ Status bar reset BEFORE deletion prevents race condition
- ✅ 500ms grace period for watcher handle release
- ✅ Comprehensive test coverage

---

## Web Research: Best Practices

### Best Practices Comparison

| Aspect | Current Implementation | Best Practice |
|--------|----------------------|---------------|
| Retry mechanism | Custom exponential backoff | Built-in `fs.rm()` options (linear) OR custom exponential |
| Retryable errors | ENOTEMPTY, EBUSY | EBUSY, EMFILE, ENFILE, ENOTEMPTY, EPERM |
| Post-deletion verification | Yes (`fs.access()`) | **Not recommended** (creates TOCTOU race) |
| Watcher disposal | Status bar reset | ✅ Correct approach |
| Grace period | 500ms before first attempt | ✅ Reasonable |

### Key Best Practices

#### 1. Use `fs.rm()` with Explicit Retry Options

Node.js 14.14.0+ provides built-in retry support:

```typescript
await rm(directoryPath, {
  recursive: true,
  force: true,
  maxRetries: 3,
  retryDelay: 100
});
```

**Source:** [Node.js Official Documentation](https://nodejs.org/api/fs.html)

#### 2. Never Check Existence Before Deletion

Checking if a file/directory exists before deleting creates TOCTOU (Time-of-Check to Time-of-Use) race conditions.

```typescript
// WRONG - Creates race condition
if (await exists(path)) {
  await rm(path, { recursive: true });
}

// CORRECT - Use force option
await rm(path, { recursive: true, force: true });
```

**Source:** [Stack Overflow - Node.js remove file](https://stackoverflow.com/questions/5315138/node-js-remove-file)

#### 3. Dispose File Watchers Before Deletion

Close or unwatch files/directories before attempting deletion to prevent EBUSY errors.

**Source:** [Chokidar GitHub](https://github.com/paulmillr/chokidar)

#### 4. Platform-Specific Retry Counts

- **macOS/Linux:** 3-5 retries sufficient
- **Windows:** 5-10 retries recommended (mandatory locking)

**Source:** [rimraf npm documentation](https://www.npmjs.com/package/rimraf)

---

## Gap Analysis

### Gap 1: Post-Deletion Verification is Unnecessary

**Current:** Verifies deletion with `fs.access()` after each attempt
**Best Practice:** If `fs.rm()` succeeds without error, the deletion is complete. Extra verification creates TOCTOU race conditions.

**Source:** Node.js documentation, Stack Overflow consensus

### Gap 2: Missing EPERM Error Handling

**Current:** Only retrying on ENOTEMPTY, EBUSY
**Best Practice:** Also retry on EPERM (permission errors from antivirus/cloud sync holding temp locks)

### Gap 3: Native fs.rm() Has Built-in Retry

**Current:** Custom retry logic
**Alternative:** `fs.rm()` supports `maxRetries` and `retryDelay` options natively

---

## Implementation Options

### Option 1: Use Native `fs.rm()` Retry (Simpler)

```typescript
await fs.rm(path, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100
});
```

**Pros:**
- Zero custom code
- Built-in handles EBUSY, EMFILE, ENFILE, ENOTEMPTY, EPERM

**Cons:**
- Linear backoff (not exponential)
- Less control over retry decision

### Option 2: Keep Custom But Improve (Recommended)

```typescript
private async deleteWithRetry(path: string): Promise<void> {
    const RETRYABLE_CODES = ['ENOTEMPTY', 'EBUSY', 'EPERM', 'EMFILE', 'ENFILE'];

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
        try {
            await fs.rm(path, { recursive: true, force: true });
            return; // Success - no verification needed
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            const isRetryable = code && RETRYABLE_CODES.includes(code);

            if (!isRetryable || attempt >= this.MAX_RETRIES - 1) {
                throw error;
            }

            const delay = this.BASE_DELAY * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}
```

**Pros:**
- Exponential backoff (more aggressive than linear)
- Handles more error codes
- No unnecessary verification

**Cons:**
- Custom code to maintain

### Option 3: Hybrid Approach

Use native retry as first line of defense, custom handling only if needed.

---

## Common Pitfalls

### Pitfall 1: Windows Non-Atomic Unlink/Rmdir

On Windows, `unlink` doesn't immediately delete files - they're marked for deletion and removed when all handles are closed.

**Solution:** Use retry with backoff, or rimraf with Windows strategy.

### Pitfall 2: File Watcher Race Condition

File watchers hold file descriptors that can prevent deletion.

**Solution:** Dispose watchers before deletion (already implemented correctly).

### Pitfall 3: Antivirus/Cloud Sync Interference

Antivirus software or cloud sync tools lock files during scanning.

**Solution:** Implement robust retry with longer delays, add EPERM to retryable errors.

---

## Recommended Tools/Libraries

| Tool | Purpose | When to Use |
|------|---------|-------------|
| Node.js `fs.rm()` | Built-in retry | Most use cases |
| rimraf | Cross-platform rm -rf | Windows reliability critical |
| graceful-fs | EMFILE/ENFILE handling | High-concurrency operations |
| chokidar | File watching | Applications that watch and delete |

---

## Key Takeaways

1. **Remove post-deletion verification** - It's unnecessary and creates race conditions
2. **Add EPERM to retryable errors** - Handles antivirus/cloud sync locks
3. **Consider native `fs.rm()` retry** - Less code, handles more error codes
4. **Grace period and status bar reset are correct** - Keep those patterns
5. **Exponential backoff is good** - More aggressive than linear

---

## Recommendation

**Option 2** (enhanced custom approach) is the best fit because:
- Exponential backoff is more effective than linear for file system operations
- Comprehensive tests already exist for the custom logic
- Minimal changes required:
  1. Remove `fs.access()` verification after `fs.rm()`
  2. Add EPERM to retryable error codes

---

## Sources

### Official Documentation
- [Node.js File System Documentation](https://nodejs.org/api/fs.html)
- [VS Code Virtual Workspaces Guide](https://code.visualstudio.com/api/extension-guides/virtual-workspaces)

### GitHub Issues & PRs
- [VS Code EBUSY File Save Issue #231542](https://github.com/microsoft/vscode/issues/231542)
- [Chokidar Race Condition Issue #1112](https://github.com/paulmillr/chokidar/issues/1112)
- [rimraf Windows ENOTEMPTY Issue #72](https://github.com/isaacs/rimraf/issues/72)

### npm Packages
- [rimraf](https://www.npmjs.com/package/rimraf)
- [graceful-fs](https://www.npmjs.com/package/graceful-fs)
- [exponential-backoff](https://www.npmjs.com/package/exponential-backoff)

### Stack Overflow
- [Remove directory which is not empty](https://stackoverflow.com/questions/18052762/remove-directory-which-is-not-empty)
- [Error: EBUSY: resource busy or locked](https://stackoverflow.com/questions/55212864/error-ebusy-resource-busy-or-locked-rmdir)
- [Node.js remove file](https://stackoverflow.com/questions/5315138/node-js-remove-file)
