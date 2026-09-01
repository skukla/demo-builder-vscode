/**
 * EnvFileWatcherService - Change Detection Tests (Mocked)
 *
 * Tests hash-based change detection and programmatic write suppression.
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

describe('EnvFileWatcherService - Change Detection (Mocked)', () => {
    let mockContext: vscode.ExtensionContext;
    let mockWatcherManager: WorkspaceWatcherManager;
    let service: EnvFileWatcherService;

    beforeEach(() => {
        resetMocks();

        mockContext = {
            subscriptions: [],
            extensionPath: '/test',
        } as any;

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

    describe('Hash-Based Change Detection', () => {
        it('should suppress notification when content unchanged (hash match)', async () => {
            // Given: File with known content
            const filePath = '/project1/.env';
            const content = 'API_KEY=test123';
            mockFileContents.set(filePath, content);

            // Initialize hash
            await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', [
                filePath,
            ]);

            // Set demo as running
            mockStateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ status: 'running' })
            );

            // When: File event fires with same content
            const uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            // Wait for async processing
            await new Promise((resolve) => process.nextTick(resolve));

            // Then: No notification shown
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Content unchanged')
            );
        });

        it('should show notification when content actually changed (hash mismatch)', async () => {
            // Given: File with initial content
            const filePath = '/project1/.env';
            const initialContent = 'API_KEY=test123';
            mockFileContents.set(filePath, initialContent);

            // Initialize hash
            await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', [
                filePath,
            ]);

            // Set demo as running
            mockStateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ status: 'running' })
            );

            // When: File content changes
            const newContent = 'API_KEY=test456';
            mockFileContents.set(filePath, newContent);

            const uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            // Wait for async processing
            await new Promise((resolve) => process.nextTick(resolve));

            // Then: Notification shown
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Environment configuration changed'),
                'Restart Demo'
            );
        });
    });

    describe('Programmatic Write Suppression', () => {
        it('should suppress notification for programmatic writes', async () => {
            // Given: File with content
            const filePath = '/project1/.env';
            const content = 'API_KEY=test123';
            mockFileContents.set(filePath, content);

            // Initialize hash
            await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', [
                filePath,
            ]);

            // Register programmatic write
            await vscode.commands.executeCommand(
                'demoBuilder._internal.registerProgrammaticWrites',
                [filePath]
            );

            // Set demo as running
            mockStateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ status: 'running' })
            );

            // When: File change event fires
            const newContent = 'API_KEY=test456';
            mockFileContents.set(filePath, newContent);

            const uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            // Wait for async processing
            await new Promise((resolve) => process.nextTick(resolve));

            // Then: No notification shown
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Ignoring programmatic write')
            );
        });
    });
});

/**
 * The apply prompts must be muted per CHANGE, not per session.
 *
 * The "shown" flags stop one change nagging repeatedly, and were cleared only by
 * TAKING the action. So a single "Later" muted the prompt for the rest of the
 * session: every subsequent save found `shouldShow` false, returned before
 * prompting, and republished nothing — while reporting the save as successful.
 *
 * Observed live 2026-08-10. A project was reconfigured onto a different Commerce
 * website; the manifest updated, the served config.json kept the old
 * website/store/store-view, and every PDP on that storefront rendered a valid
 * 200 with an empty product block. No message was shown at any point.
 */
describe('apply prompts are re-armed by a new config change', () => {
    const { commandCallbacks } = require('./envFileWatcherService.testUtils');
    const shouldShow = (which: 'Mesh' | 'Storefront') =>
        commandCallbacks[`demoBuilder._internal.shouldShow${which}Notification`]();
    const markShown = (which: 'Mesh' | 'Storefront') =>
        commandCallbacks[`demoBuilder._internal.mark${which}NotificationShown`]();
    const configChanged = () => commandCallbacks['demoBuilder._internal.configChanged']();

    it('starts armed', () => {
        // Control: without this, "always armed" would pass every case below.
        expect(shouldShow('Storefront')).toBe(true);
        expect(shouldShow('Mesh')).toBe(true);
    });

    it('mutes after the prompt is shown, so one change cannot nag', () => {
        markShown('Storefront');

        expect(shouldShow('Storefront')).toBe(false);
    });

    it('re-arms the storefront prompt when a new change is saved', () => {
        // THE regression. Before the fix nothing but `storefrontActionTaken`
        // cleared this, so declining once silenced every later save.
        markShown('Storefront');
        expect(shouldShow('Storefront')).toBe(false);

        configChanged();

        expect(shouldShow('Storefront')).toBe(true);
    });

    it('re-arms the mesh prompt too — it had the identical defect', () => {
        markShown('Mesh');
        expect(shouldShow('Mesh')).toBe(false);

        configChanged();

        expect(shouldShow('Mesh')).toBe(true);
    });

    it('still re-arms when the action is taken', () => {
        // The pre-existing path must keep working.
        markShown('Storefront');
        commandCallbacks['demoBuilder._internal.storefrontActionTaken']();

        expect(shouldShow('Storefront')).toBe(true);
    });

    it('does not touch the restart prompt', () => {
        // Scoped deliberately: restart is a different concern with its own
        // trigger, and re-arming it here would reintroduce notification spam.
        markShown('Storefront');
        commandCallbacks['demoBuilder._internal.markRestartNotificationShown']();

        configChanged();

        expect(commandCallbacks['demoBuilder._internal.shouldShowRestartNotification']()).toBe(
            false
        );
    });
});
