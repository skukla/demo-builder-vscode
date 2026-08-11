# Research: Demo Inspector Not Appearing

**Date**: 2025-12-01
**Scope**: Codebase (citisignal-nextjs)
**Depth**: Standard

---

## Summary

The Demo Inspector uses an **optional git submodule pattern** with a no-op stub fallback. Despite the submodule being present in the codebase, the **webpack alias detection may be failing**, causing the application to load stub implementations that render nothing and attach no keyboard handlers.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  @/demo-inspector path alias                                │
│  ├── tsconfig.json → points to stub (default)               │
│  └── next.config.ts webpack → should override to real       │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────────┐     ┌─────────────────────────┐
│  demo-inspector-stub│     │  demo-inspector (real)  │
│  (no-op fallback)   │     │  (git submodule)        │
│                     │     │                         │
│  DemoInspector()    │     │  DemoInspector.tsx      │
│  → returns null     │     │  → full UI + shortcuts  │
│                     │     │                         │
│  useDemoInspector() │     │  DemoInspectorContext   │
│  → enabled: false   │     │  → keyboard handling    │
│  → all no-ops       │     │  → state management     │
└─────────────────────┘     └─────────────────────────┘
```

---

## Relevant Files

| File | Purpose |
|------|---------|
| `src/demo-inspector/` | Real implementation (git submodule) |
| `src/demo-inspector-stub/index.ts:74-130` | No-op stub that returns `null` |
| `src/app/layout.tsx:1-51` | Root layout importing `@/demo-inspector` |
| `tsconfig.json:22-24` | Path alias → stub (default) |
| `next.config.ts:10-70` | Webpack alias override logic |
| `.gitmodules:1-3` | Submodule configuration |

---

## Root Cause Analysis

The detection logic in `next.config.ts:10-70`:

```typescript
const demoInspectorPath = path.join(__dirname, 'src/demo-inspector/index.ts');
const hasDemoInspector = fs.existsSync(demoInspectorPath);

if (!hasDemoInspector) {
  console.log('📦 Demo Inspector not installed - using stub module');
}
```

### Potential Issues

1. **File path check failing** - The `fs.existsSync()` may return `false` even though files exist
2. **Submodule not fully initialized** - Files present but possibly empty/incomplete
3. **Webpack alias not applying** - Override not taking effect

---

## Debugging Steps

### Option 1: Check Console Output

When you run `npm run dev`, look for:
- `📦 Demo Inspector not installed - using stub module` → Stub is being used
- No message → Real module should be loading

### Option 2: Verify Submodule Files

```bash
# Check if the actual file exists
ls -la /Users/<user>/Documents/Repositories/app-builder/adobe-demo-system/citisignal-nextjs/src/demo-inspector/index.ts

# Check submodule status
cd /Users/<user>/Documents/Repositories/app-builder/adobe-demo-system/citisignal-nextjs
git submodule status
```

### Option 3: Force Submodule Reinitialization

```bash
cd /Users/<user>/Documents/Repositories/app-builder/adobe-demo-system/citisignal-nextjs
git submodule update --init --recursive
```

### Option 4: Check localStorage

Even if real module loads, it may be disabled. In browser console:

```javascript
localStorage.getItem('demo-inspector-prefs')
// If returns {"enabled":false,...}, the inspector is disabled

localStorage.removeItem('demo-inspector-prefs')
// Then refresh and try Cmd+Shift+D again
```

---

## Keyboard Shortcuts (When Working)

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+D` | Toggle inspector on/off |
| `Cmd+Shift+E` | Collapse/expand panel |
| `Cmd+Shift+←` | Move to left side |
| `Cmd+Shift+→` | Move to right side |

---

## Common Pitfalls

1. **Stub renders nothing** - `DemoInspector()` in stub returns `null`, no UI ever appears
2. **No keyboard listener** - Stub's `DemoInspectorProvider` doesn't attach any event listeners
3. **Default disabled** - Real inspector starts with `enabled: false`, requires Cmd+Shift+D
4. **localStorage override** - Previous session preferences may keep it disabled

---

## Key Takeaways

1. The git submodule **is present** (`git submodule status` shows it)
2. The webpack detection in `next.config.ts` may be **failing the file check**
3. If stub is loaded, **nothing renders** and **keyboard shortcuts don't work**
4. Quick test: Check dev server console for "Demo Inspector not installed" message

---

## Next Steps

1. Run `npm run dev` and check console for stub message
2. If stub message appears, verify `src/demo-inspector/index.ts` exists
3. If file exists but still using stub, check webpack config path resolution
4. If real module loads, check localStorage and try Cmd+Shift+D
