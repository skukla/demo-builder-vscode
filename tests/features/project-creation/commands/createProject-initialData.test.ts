/**
 * CreateProjectWebviewCommand.getInitialData — wizard-steps validation
 *
 * Regression coverage for the silent step drop: a wizard-steps.json entry
 * missing `enabled` used to be sent to the webview unvalidated, where every
 * consumer filters on `step.enabled` (wizardHelpers.ts:113/:424/:539) — so
 * `undefined` being falsy dropped every step from the wizard with no error.
 */

import * as fs from 'fs';
import * as vscode from 'vscode';
import { CreateProjectWebviewCommand } from '@/features/project-creation/commands/createProject';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

// Factory mock keeping the real module: transitive deps (fetch-blob via the
// auth service import chain) destructure fs.promises at load time, so a bare
// auto-mock crashes the suite before any test runs.
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
}));
jest.mock('@/core/logging/debugLogger');
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            isAuthenticated: jest.fn(),
        })),
        getCommandExecutor: jest.fn(() => ({
            execute: jest.fn(),
        })),
    },
}));
jest.mock('@/features/prerequisites/services/PrerequisitesManager');

function createMockExtensionContext(): vscode.ExtensionContext {
    return {
        subscriptions: [],
        extensionPath: '/mock/extension/path',
        globalState: {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(() => []),
            setKeysForSync: jest.fn(),
        },
        workspaceState: {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(() => []),
        },
        extensionUri: vscode.Uri.file('/mock/extension/path'),
        extensionMode: vscode.ExtensionMode.Test,
        asAbsolutePath: (relativePath: string) => `/mock/extension/path/${relativePath}`,
        secrets: {},
    } as unknown as vscode.ExtensionContext;
}


/** Serve `json` as the wizard-steps.json content; no other file exists. */
function setupStepsFile(json: string): void {
    (fs.existsSync as jest.Mock).mockImplementation((p: unknown) =>
        String(p).endsWith('wizard-steps.json')
    );
    (fs.readFileSync as jest.Mock).mockImplementation(() => json);
}

describe('CreateProjectWebviewCommand - getInitialData wizard-steps validation', () => {
    let command: CreateProjectWebviewCommand;
    let mockLogger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();

        // Settings reads fall through to their declared defaults.
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
        });

        mockLogger = createMockLogger();
        command = new CreateProjectWebviewCommand(
            createMockExtensionContext(),
            createMockStateManager(),
            mockLogger
        );
    });

    it('rejects a steps config where a step is missing `enabled` and reports the failure', async () => {
        setupStepsFile(
            JSON.stringify({
                steps: [
                    { id: 'welcome', name: 'Demo Setup' },
                    { id: 'review', name: 'Final Review', enabled: true },
                ],
            })
        );

        const data = await (command as any).getInitialData();

        expect(data.wizardSteps).toBeNull();
        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('wizard-steps.json'));
    });

    it('sends steps through unchanged when every step carries id, name, and enabled', async () => {
        const steps = [
            { id: 'welcome', name: 'Demo Setup', description: 'Choose a brand.', enabled: true },
            {
                id: 'storefront-setup',
                name: 'Publish Storefront',
                enabled: true,
                condition: { stackRequiresAny: ['requiresGitHub'] },
            },
        ];
        setupStepsFile(JSON.stringify({ steps }));

        const data = await (command as any).getInitialData();

        expect(data.wizardSteps).toEqual(steps);
        expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('rejects a step whose `enabled` is not a boolean', async () => {
        setupStepsFile(
            JSON.stringify({
                steps: [{ id: 'welcome', name: 'Demo Setup', enabled: 'true' }],
            })
        );

        const data = await (command as any).getInitialData();

        expect(data.wizardSteps).toBeNull();
    });
});
