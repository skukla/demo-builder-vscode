/**
 * UpdateManager Test Suite - Early-Access Gate
 *
 * Verifies that the early-access channel is honored only for verified repo
 * collaborators and otherwise falls back to beta. The gate is mocked here;
 * its own behavior is covered by collaboratorGate.test.ts.
 */

jest.mock('vscode', () => ({
    workspace: { getConfiguration: jest.fn() },
}), { virtual: true });

jest.mock('@/core/logging', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 5000 },
}));

jest.mock('@/core/validation', () => ({
    validateGitHubDownloadURL: jest.fn().mockReturnValue(true),
    sanitizeErrorForLogging: jest.fn((msg: string) => msg),
}));

// Mock the gate so we control collaborator verification
jest.mock('@/features/updates/services/collaboratorGate', () => ({
    isRepoCollaborator: jest.fn(),
    clearCollaboratorCache: jest.fn(),
}));

global.fetch = jest.fn() as jest.Mock;

import { UpdateManager } from '@/features/updates/services/updateManager';
import { isRepoCollaborator } from '@/features/updates/services/collaboratorGate';
import * as vscode from 'vscode';
import {
    createMockContext,
    createMockLogger,
    createMockWorkspaceConfig,
    createMockReleasesArray,
    mockSecurityValidationPass,
} from './updateManager.testUtils';

const mockIsCollaborator = isRepoCollaborator as jest.Mock;

function mockReleasesArrayResponse(): void {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => createMockReleasesArray(),
    });
}

describe('UpdateManager - Early-Access Gate', () => {
    let mockContext: any;
    let mockLogger: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext('1.0.0');
        mockLogger = createMockLogger();
        mockSecurityValidationPass();
    });

    describe('early-access honored for collaborators', () => {
        it('installs the alpha build when the user is a collaborator', async () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
                createMockWorkspaceConfig('early-access')
            );
            mockIsCollaborator.mockResolvedValue(true);
            mockReleasesArrayResponse();

            const result = await new UpdateManager(mockContext, mockLogger).checkExtensionUpdate();

            expect(result.latest).toBe('2.0.0-alpha.1');
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/releases?per_page=20'),
                expect.any(Object)
            );
        });
    });

    describe('fallback to beta when gate denies', () => {
        it('selects the beta build (not the alpha) for a non-collaborator', async () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
                createMockWorkspaceConfig('early-access')
            );
            mockIsCollaborator.mockResolvedValue(false);
            mockReleasesArrayResponse();

            const result = await new UpdateManager(mockContext, mockLogger).checkExtensionUpdate();

            expect(result.latest).toBe('1.2.0-beta.1');
        });
    });

    describe('gate not consulted for non-EA channels', () => {
        it('does not call the gate on stable', async () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
                createMockWorkspaceConfig('stable')
            );
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    tag_name: 'v1.1.0',
                    body: 'Stable',
                    published_at: '2024-01-01T00:00:00Z',
                    prerelease: false,
                    draft: false,
                    assets: [
                        {
                            name: 'extension.vsix',
                            browser_download_url: 'https://github.com/test/repo/releases/download/v1.1.0/extension.vsix',
                        },
                    ],
                }),
            });

            await new UpdateManager(mockContext, mockLogger).checkExtensionUpdate();
            expect(mockIsCollaborator).not.toHaveBeenCalled();
        });

        it('does not call the gate on beta', async () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
                createMockWorkspaceConfig('beta')
            );
            mockReleasesArrayResponse();

            await new UpdateManager(mockContext, mockLogger).checkExtensionUpdate();
            expect(mockIsCollaborator).not.toHaveBeenCalled();
        });
    });

    describe('gate failure is graceful', () => {
        it('falls back to beta when the gate rejects', async () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
                createMockWorkspaceConfig('early-access')
            );
            mockIsCollaborator.mockRejectedValue(new Error('boom'));
            mockReleasesArrayResponse();

            const manager = new UpdateManager(mockContext, mockLogger);
            const result = await manager.checkExtensionUpdate();

            // gate threw -> treated as non-collaborator -> beta selection
            expect(result.latest).toBe('1.2.0-beta.1');
        });
    });
});
