# Step 2: Add Memento for Transient State

## Objective

Add VS Code's native `globalState` (Memento API) for transient data that should persist across extension reloads but not require file-based storage.

## Current State

All state stored in file-based system (`~/.demo-builder/state.json`):
- Project data (correct for file-based)
- Recent projects (correct for file-based)
- No separation between persistent and transient data

## Target State

**File-based state** (existing - unchanged):
- Project manifests, recent projects
- Data that should survive extension uninstallation
- Human-readable configuration

**Memento state** (new):
- "Don't show again" notification flags
- Session-specific preferences (e.g., last active log channel)
- Data that can sync across machines via VS Code Settings Sync

## Use Cases

### 1. Notification Suppression Flags
```typescript
// Check if user dismissed "What's New" for this version
const dismissed = await transientState.get('whatsNew.dismissed.1.6.0', false);
if (!dismissed) {
    await showWhatsNew();
}

// User clicks "Don't show again"
await transientState.set('whatsNew.dismissed.1.6.0', true);
```

### 2. Dashboard Preferences
```typescript
// Remember which log channel user last had open
const lastChannel = await transientState.get('dashboard.lastLogChannel', 'logs');
// 'logs' or 'debug'
```

### 3. Session Cache (with TTL)
```typescript
// Cache that survives extension reload but not indefinitely
await transientState.setWithTTL('cache.authStatus', authData, 3600000); // 1 hour
```

## Implementation

### New File: `src/core/state/transientStateManager.ts`

```typescript
import * as vscode from 'vscode';

/**
 * Manages transient state using VS Code's globalState (Memento API)
 *
 * Use this for:
 * - "Don't show again" flags
 * - Session preferences (last active channel, etc.)
 * - Data that can sync across machines
 *
 * Do NOT use this for:
 * - Project data (use StateManager with file-based storage)
 * - Data that must survive extension uninstallation
 */
export class TransientStateManager {
    private globalState: vscode.Memento;

    constructor(context: vscode.ExtensionContext) {
        this.globalState = context.globalState;

        // Keys that should sync across machines via VS Code Settings Sync
        context.globalState.setKeysForSync([
            'notification.dismissed',
            'preferences.logChannel',
            'whatsNew.dismissed'
        ]);
    }

    /**
     * Get a value from transient state
     */
    async get<T>(key: string, defaultValue: T): Promise<T> {
        const value = this.globalState.get<T>(key);
        return value ?? defaultValue;
    }

    /**
     * Set a value in transient state
     */
    async set<T>(key: string, value: T): Promise<void> {
        await this.globalState.update(key, value);
    }

    /**
     * Check if a key exists
     */
    has(key: string): boolean {
        return this.globalState.get(key) !== undefined;
    }

    /**
     * Remove a key from transient state
     */
    async remove(key: string): Promise<void> {
        await this.globalState.update(key, undefined);
    }

    /**
     * Set a value with TTL (time-to-live)
     * Value automatically expires after specified milliseconds
     */
    async setWithTTL<T>(key: string, value: T, ttlMs: number): Promise<void> {
        const expiresAt = Date.now() + ttlMs;
        await this.globalState.update(key, { value, expiresAt });
    }

    /**
     * Get a value with TTL, returns undefined if expired
     */
    async getWithTTL<T>(key: string): Promise<T | undefined> {
        const stored = this.globalState.get<{ value: T; expiresAt: number }>(key);
        if (!stored) return undefined;

        if (Date.now() > stored.expiresAt) {
            // Expired - clean up
            await this.remove(key);
            return undefined;
        }

        return stored.value;
    }

    // Convenience methods for common patterns

    /**
     * Check if a notification has been dismissed
     */
    async isNotificationDismissed(notificationId: string): Promise<boolean> {
        return this.get(`notification.dismissed.${notificationId}`, false);
    }

    /**
     * Mark a notification as dismissed
     */
    async dismissNotification(notificationId: string): Promise<void> {
        await this.set(`notification.dismissed.${notificationId}`, true);
    }

    /**
     * Get user's preferred log channel
     */
    async getPreferredLogChannel(): Promise<'logs' | 'debug'> {
        return this.get('preferences.logChannel', 'logs');
    }

    /**
     * Set user's preferred log channel
     */
    async setPreferredLogChannel(channel: 'logs' | 'debug'): Promise<void> {
        await this.set('preferences.logChannel', channel);
    }
}
```

### Update: `src/core/state/index.ts`

```typescript
export { StateManager } from './stateManager';
export { StateCoordinator } from './stateCoordinator';
export { TransientStateManager } from './transientStateManager';  // NEW
```

### Update: `src/extension.ts`

```typescript
import { TransientStateManager } from '@/core/state';

export async function activate(context: vscode.ExtensionContext) {
    // ... existing code ...

    // Initialize transient state manager
    const transientState = new TransientStateManager(context);

    // ... pass to services that need it ...
}
```

## Testing Strategy

### Unit Tests: `tests/core/state/transientStateManager.test.ts`

```typescript
describe('TransientStateManager', () => {
    let mockContext: vscode.ExtensionContext;
    let mockGlobalState: Map<string, unknown>;

    beforeEach(() => {
        mockGlobalState = new Map();
        mockContext = {
            globalState: {
                get: (key: string) => mockGlobalState.get(key),
                update: async (key: string, value: unknown) => {
                    if (value === undefined) {
                        mockGlobalState.delete(key);
                    } else {
                        mockGlobalState.set(key, value);
                    }
                },
                setKeysForSync: jest.fn(),
                keys: () => [...mockGlobalState.keys()],
            }
        } as unknown as vscode.ExtensionContext;
    });

    describe('basic operations', () => {
        it('should get default value when key not set', async () => {
            const manager = new TransientStateManager(mockContext);
            const value = await manager.get('nonexistent', 'default');
            expect(value).toBe('default');
        });

        it('should set and get value', async () => {
            const manager = new TransientStateManager(mockContext);
            await manager.set('key', 'value');
            const value = await manager.get('key', 'default');
            expect(value).toBe('value');
        });

        it('should remove value', async () => {
            const manager = new TransientStateManager(mockContext);
            await manager.set('key', 'value');
            await manager.remove('key');
            const value = await manager.get('key', 'default');
            expect(value).toBe('default');
        });
    });

    describe('TTL operations', () => {
        it('should return value before expiry', async () => {
            const manager = new TransientStateManager(mockContext);
            await manager.setWithTTL('key', 'value', 10000);
            const value = await manager.getWithTTL<string>('key');
            expect(value).toBe('value');
        });

        it('should return undefined after expiry', async () => {
            jest.useFakeTimers();
            const manager = new TransientStateManager(mockContext);
            await manager.setWithTTL('key', 'value', 1000);

            jest.advanceTimersByTime(2000);

            const value = await manager.getWithTTL<string>('key');
            expect(value).toBeUndefined();
            jest.useRealTimers();
        });
    });

    describe('notification helpers', () => {
        it('should track dismissed notifications', async () => {
            const manager = new TransientStateManager(mockContext);

            expect(await manager.isNotificationDismissed('test')).toBe(false);
            await manager.dismissNotification('test');
            expect(await manager.isNotificationDismissed('test')).toBe(true);
        });
    });

    describe('log channel preference', () => {
        it('should default to logs channel', async () => {
            const manager = new TransientStateManager(mockContext);
            expect(await manager.getPreferredLogChannel()).toBe('logs');
        });

        it('should remember user preference', async () => {
            const manager = new TransientStateManager(mockContext);
            await manager.setPreferredLogChannel('debug');
            expect(await manager.getPreferredLogChannel()).toBe('debug');
        });
    });
});
```

## Integration Points

### Dashboard Logs Toggle (Future Enhancement)
```typescript
// In dashboard handler
async function handleToggleLogs(channel?: 'logs' | 'debug') {
    const preferred = channel ?? await transientState.getPreferredLogChannel();

    if (channel) {
        await transientState.setPreferredLogChannel(channel);
    }

    // Show the channel...
}
```

### Update Notifications (Future Enhancement)
```typescript
// In update checker
async function showUpdateNotification(version: string) {
    const notificationId = `update.${version}`;

    if (await transientState.isNotificationDismissed(notificationId)) {
        return; // User already dismissed this version's notification
    }

    const action = await vscode.window.showInformationMessage(
        `Demo Builder ${version} is available!`,
        'Update Now',
        'Don\'t Show Again'
    );

    if (action === 'Don\'t Show Again') {
        await transientState.dismissNotification(notificationId);
    }
}
```

## Acceptance Criteria

- [ ] `TransientStateManager` class implemented
- [ ] Unit tests with 90%+ coverage
- [ ] Exported from `@/core/state`
- [ ] Integrated into extension activation
- [ ] Keys configured for VS Code Settings Sync
- [ ] Documentation in `src/core/state/README.md` updated

## Risk Assessment

**Risk Level:** LOW

**Rationale:**
- Additive change - doesn't modify existing state management
- Uses stable VS Code API (available since VS Code 1.0)
- Well-defined interface
- Easy to test

## Dependencies

None - this step is independent. Can be implemented in parallel with Step 1.

## Estimated Effort

~1-2 hours (implementation + tests)
