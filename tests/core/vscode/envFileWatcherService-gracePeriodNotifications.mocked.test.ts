/**
 * EnvFileWatcherService - Grace Period and Notification Tests (Mocked)
 *
 * Tests demo startup grace period, show-once notification management,
 * and watcher disposal.
 *
 * Pattern: File System Mocking (Pattern 2)
 * Reference: .rptc/plans/resource-lifecycle-management/TESTING-MOCKING-PATTERNS.md
 */

import {
    EnvFileWatcherService,
    WorkspaceWatcherManager,
    vscode,
    mockWatchers,
    mockFileContents,
    mockStateManager,
    mockLogger,
    resetMocks,
    settleFileChange,
} from './envFileWatcherService.testUtils';
import { createMockProject } from '../../helpers/projectFake';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

import { createMockExtensionContext } from '../../helpers/extensionContextFake';
describe('EnvFileWatcherService - Grace Period and Notifications (Mocked)', () => {
    let mockContext: vscode.ExtensionContext;
    let mockWatcherManager: WorkspaceWatcherManager;
    let service: EnvFileWatcherService;

    beforeEach(() => {
        resetMocks();

        // The canonical fake, with this suite's path. The literal it replaces named
        // two of ExtensionContext's twenty-one members and cast the difference away.
        mockContext = createMockExtensionContext({ subscriptions: [] }, '/test');

        mockWatcherManager = new WorkspaceWatcherManager();

        service = new EnvFileWatcherService(
            mockContext,
            mockStateManager,
            mockWatcherManager,
            mockLogger
        );

        service.initialize();
    });

    afterEach(() => {
        service?.dispose();
    });

    describe('Demo Startup Grace Period', () => {
        it('should suppress notifications during grace period', async () => {
            // Given: File with content
            const filePath = '/project1/.env';
            const initialContent = 'API_KEY=test123';
            mockFileContents.set(filePath, initialContent);

            // Initialize hash
            await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', [
                filePath,
            ]);

            // Trigger demo start
            await vscode.commands.executeCommand('demoBuilder._internal.demoStarted');

            // Set demo as running
            mockStateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ status: 'running' })
            );

            // When: File changes within grace period (<10 seconds)
            const newContent = 'API_KEY=test456';
            mockFileContents.set(filePath, newContent);

            const uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            // Wait for async processing
            await new Promise((resolve) => process.nextTick(resolve));

            // Then: No notification shown (within grace period)
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('grace period'));
        });

        it('should stop suppressing the moment the grace period is up', async () => {
            const filePath = '/project1/.env';
            mockFileContents.set(filePath, 'API_KEY=test123');
            await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', [
                filePath,
            ]);

            // Pin the clock so the boundary is exact: the window is "less than"
            // STARTUP_GRACE_PERIOD, so a change AT the boundary is already outside it.
            const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
            try {
                await vscode.commands.executeCommand('demoBuilder._internal.demoStarted');
                nowSpy.mockReturnValue(1_000_000 + TIMEOUTS.STARTUP_UPDATE_CHECK_DELAY);

                mockStateManager.getCurrentProject.mockResolvedValue(
                    createMockProject({ status: 'running' })
                );
                mockFileContents.set(filePath, 'API_KEY=test456');
                mockWatchers[0]._simulateChange(vscode.Uri.file(filePath));
                await settleFileChange();

                expect(vscode.window.showInformationMessage).toHaveBeenCalled();
            } finally {
                nowSpy.mockRestore();
            }
        });

        it('should forget the recorded hashes when the demo stops', async () => {
            // A stopped demo's .env is about to be rewritten by setup; the hashes
            // belong to the run that ended, so the next event is a first sighting.
            const filePath = '/project1/.env';
            mockFileContents.set(filePath, 'API_KEY=test123');
            await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', [
                filePath,
            ]);
            mockStateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ status: 'running' })
            );

            await vscode.commands.executeCommand('demoBuilder._internal.demoStopped');

            mockFileContents.set(filePath, 'API_KEY=test456');
            mockWatchers[0]._simulateChange(vscode.Uri.file(filePath));
            await settleFileChange();

            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });
    });

    describe('Notification Target', () => {
        const filePath = '/project1/.env';

        const changeAfterHashing = async (): Promise<void> => {
            mockFileContents.set(filePath, 'API_KEY=test123');
            await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', [
                filePath,
            ]);
            mockFileContents.set(filePath, 'API_KEY=test456');
            mockWatchers[0]._simulateChange(vscode.Uri.file(filePath));
            await settleFileChange();
        };

        it('should not offer a restart when the demo is not running', async () => {
            mockStateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ status: 'stopped' })
            );

            await changeAfterHashing();

            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('should not offer a restart when there is no current project', async () => {
            mockStateManager.getCurrentProject.mockResolvedValue(undefined);

            await changeAfterHashing();

            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('should stop then start the demo when the SC picks Restart Demo', async () => {
            mockStateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ status: 'running' })
            );
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(
                'Restart Demo'
            );

            await changeAfterHashing();
            // The restart is two chained commands behind the notification's promise.
            await settleFileChange();

            const executed = (vscode.commands.executeCommand as jest.Mock).mock.calls.map(
                (call) => call[0]
            );
            expect(executed).toContain('demoBuilder.stopDemo');
            expect(executed).toContain('demoBuilder.startDemo');
        });

        it('should do nothing when the notification is dismissed', async () => {
            mockStateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ status: 'running' })
            );
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(undefined);

            await changeAfterHashing();
            await settleFileChange();

            const executed = (vscode.commands.executeCommand as jest.Mock).mock.calls.map(
                (call) => call[0]
            );
            expect(executed).not.toContain('demoBuilder.stopDemo');
            expect(executed).not.toContain('demoBuilder.startDemo');
        });
    });

    describe('Show-Once Notification Management', () => {
        it('should re-arm the restart notification when the demo starts', async () => {
            await vscode.commands.executeCommand(
                'demoBuilder._internal.markRestartNotificationShown'
            );
            expect(
                await vscode.commands.executeCommand(
                    'demoBuilder._internal.shouldShowRestartNotification'
                )
            ).toBe(false);

            await vscode.commands.executeCommand('demoBuilder._internal.demoStarted');

            // A new run gets its own one prompt: the flag is per demo, not per session.
            expect(
                await vscode.commands.executeCommand(
                    'demoBuilder._internal.shouldShowRestartNotification'
                )
            ).toBe(true);
        });

        it('should show notification only once per session', async () => {
            // Given: File with content
            const filePath = '/project1/.env';
            let content = 'API_KEY=test123';
            mockFileContents.set(filePath, content);

            // Initialize hash
            await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', [
                filePath,
            ]);

            // Set demo as running
            mockStateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ status: 'running' })
            );

            // When: First file change
            content = 'API_KEY=test456';
            mockFileContents.set(filePath, content);

            let uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            await new Promise((resolve) => process.nextTick(resolve));

            // Then: First change shows notification
            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);

            // Clear mock
            (vscode.window.showInformationMessage as jest.Mock).mockClear();

            // When: Second file change
            content = 'API_KEY=test789';
            mockFileContents.set(filePath, content);

            uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            await new Promise((resolve) => process.nextTick(resolve));

            // Then: Second change suppressed
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('already shown'));
        });

        it('should reset notification flag on action taken', async () => {
            // Given: File with content and notification shown
            const filePath = '/project1/.env';
            let content = 'API_KEY=test123';
            mockFileContents.set(filePath, content);

            await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', [
                filePath,
            ]);

            mockStateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ status: 'running' })
            );

            // Show notification
            content = 'API_KEY=test456';
            mockFileContents.set(filePath, content);

            let uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            await new Promise((resolve) => process.nextTick(resolve));

            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);

            // Clear mock
            (vscode.window.showInformationMessage as jest.Mock).mockClear();

            // When: User takes restart action
            await vscode.commands.executeCommand('demoBuilder._internal.restartActionTaken');

            // And: Next change occurs
            content = 'API_KEY=test789';
            mockFileContents.set(filePath, content);

            uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            await new Promise((resolve) => process.nextTick(resolve));

            // Then: Notification shown again
            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        });
    });

    describe('Watcher Disposal on Workspace Folder Removal', () => {
        it('should dispose watchers when workspace folder removed', () => {
            // Given: Service with active watchers
            expect(mockWatchers.length).toBeGreaterThan(0);

            // When: Service disposed (simulating folder removal)
            service.dispose();

            // Then: Logger confirms disposal
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Service disposed')
            );
        });
    });
});
