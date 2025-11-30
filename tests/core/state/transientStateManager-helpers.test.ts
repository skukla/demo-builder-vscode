/**
 * TransientStateManager Helper Tests
 *
 * Tests for notification helpers and log channel preferences.
 */

import { createMockContext } from './transientStateManager.testUtils';
import { TransientStateManager } from '@/core/state/transientStateManager';

describe('TransientStateManager - Notification Helpers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('isNotificationDismissed', () => {
        it('should return false for non-dismissed notification', async () => {
            const { context } = createMockContext();
            const manager = new TransientStateManager(context);

            const isDismissed =
                await manager.isNotificationDismissed('update-v1.0.0');

            expect(isDismissed).toBe(false);
        });

        it('should return true for dismissed notification', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            globalState.set('notification.dismissed.update-v1.0.0', true);

            const isDismissed =
                await manager.isNotificationDismissed('update-v1.0.0');

            expect(isDismissed).toBe(true);
        });

        it('should handle multiple notification IDs independently', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            globalState.set('notification.dismissed.notif1', true);

            const notif1Dismissed =
                await manager.isNotificationDismissed('notif1');
            const notif2Dismissed =
                await manager.isNotificationDismissed('notif2');

            expect(notif1Dismissed).toBe(true);
            expect(notif2Dismissed).toBe(false);
        });
    });

    describe('dismissNotification', () => {
        it('should mark notification as dismissed', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);

            await manager.dismissNotification('whatsNew-v1.5.0');

            expect(
                globalState.get('notification.dismissed.whatsNew-v1.5.0')
            ).toBe(true);
        });

        it('should allow dismissing multiple notifications', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);

            await manager.dismissNotification('notif1');
            await manager.dismissNotification('notif2');

            expect(globalState.get('notification.dismissed.notif1')).toBe(true);
            expect(globalState.get('notification.dismissed.notif2')).toBe(true);
        });

        it('should be idempotent', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            await manager.dismissNotification('notif');

            await manager.dismissNotification('notif');

            expect(globalState.get('notification.dismissed.notif')).toBe(true);
        });
    });

    describe('isNotificationDismissed and dismissNotification integration', () => {
        it('should reflect dismissal status after dismissing', async () => {
            const { context } = createMockContext();
            const manager = new TransientStateManager(context);

            const beforeDismissal =
                await manager.isNotificationDismissed('testNotif');
            await manager.dismissNotification('testNotif');
            const afterDismissal =
                await manager.isNotificationDismissed('testNotif');

            expect(beforeDismissal).toBe(false);
            expect(afterDismissal).toBe(true);
        });
    });
});

describe('TransientStateManager - Log Channel Preference', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getPreferredLogChannel', () => {
        it('should return logs as default channel', async () => {
            const { context } = createMockContext();
            const manager = new TransientStateManager(context);

            const channel = await manager.getPreferredLogChannel();

            expect(channel).toBe('logs');
        });

        it('should return stored channel preference', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            globalState.set('preferences.logChannel', 'debug');

            const channel = await manager.getPreferredLogChannel();

            expect(channel).toBe('debug');
        });

        it('should return logs when stored preference is logs', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            globalState.set('preferences.logChannel', 'logs');

            const channel = await manager.getPreferredLogChannel();

            expect(channel).toBe('logs');
        });
    });

    describe('setPreferredLogChannel', () => {
        it('should set channel to logs', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);

            await manager.setPreferredLogChannel('logs');

            expect(globalState.get('preferences.logChannel')).toBe('logs');
        });

        it('should set channel to debug', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);

            await manager.setPreferredLogChannel('debug');

            expect(globalState.get('preferences.logChannel')).toBe('debug');
        });

        it('should overwrite existing preference', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            globalState.set('preferences.logChannel', 'logs');

            await manager.setPreferredLogChannel('debug');

            expect(globalState.get('preferences.logChannel')).toBe('debug');
        });
    });

    describe('getPreferredLogChannel and setPreferredLogChannel integration', () => {
        it('should round-trip channel preference', async () => {
            const { context } = createMockContext();
            const manager = new TransientStateManager(context);

            await manager.setPreferredLogChannel('debug');
            const channel = await manager.getPreferredLogChannel();

            expect(channel).toBe('debug');
        });

        it('should allow changing preference multiple times', async () => {
            const { context } = createMockContext();
            const manager = new TransientStateManager(context);

            await manager.setPreferredLogChannel('debug');
            expect(await manager.getPreferredLogChannel()).toBe('debug');

            await manager.setPreferredLogChannel('logs');
            expect(await manager.getPreferredLogChannel()).toBe('logs');

            await manager.setPreferredLogChannel('debug');
            expect(await manager.getPreferredLogChannel()).toBe('debug');
        });
    });
});
