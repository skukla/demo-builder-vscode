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
} from './envFileWatcherService.testUtils';
import { createMockProject } from '../../helpers/projectFake';

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
    });

    describe('Show-Once Notification Management', () => {
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
