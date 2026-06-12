/**
 * edsHelpers — getEwCanvasBranch tests
 *
 * getEwCanvasBranch reads the demoBuilder.daLive.ewCanvasBranch setting — the
 * da-nx branch the Experience Workspace canvas loads from (the `?nx=` override).
 * It defaults to '' (the param-less production canvas, now the live EW alpha)
 * and returns the value trimmed. An empty/whitespace-only setting returns '' so
 * the URL builder drops the ?nx override entirely (the production form). A
 * non-string (corrupted settings.json) also falls back to the '' default.
 *
 * Mirrors the vscode getConfiguration mock pattern from
 * edsHelpers-authoringExperience.test.ts.
 */

// jest.mock factories are hoisted above imports; references inside must be
// prefixed `mock` and declared with `var`.
/* eslint-disable no-var */
var mockEwCanvasBranchValue: unknown;
/* eslint-enable no-var */

jest.mock('vscode', () => {
    mockEwCanvasBranchValue = undefined;  // honor the default
    return {
        workspace: {
            getConfiguration: jest.fn().mockReturnValue({
                get: jest.fn((key: string, defaultValue?: unknown) => {
                    if (key === 'ewCanvasBranch') {
                        return mockEwCanvasBranchValue === undefined
                            ? defaultValue
                            : mockEwCanvasBranchValue;
                    }
                    return defaultValue;
                }),
            }),
        },
    };
}, { virtual: true });

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    }),
    initializeLogger: jest.fn(),
}));

// Service imports required by the edsHelpers module to load.
jest.mock('@/features/eds/services/githubTokenService');
jest.mock('@/features/eds/services/githubRepoOperations');
jest.mock('@/features/eds/services/githubFileOperations');
jest.mock('@/features/eds/services/githubOAuthService');
jest.mock('@/features/eds/services/daLiveAuthService');
jest.mock('@/features/eds/services/daLiveOrgOperations', () => ({
    hasWriteAccess: jest.fn(),
}));

import { getEwCanvasBranch } from '@/features/eds/handlers/edsHelpers';
import * as vscode from 'vscode';

describe('getEwCanvasBranch', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockEwCanvasBranchValue = undefined;  // honor the default
    });

    it("defaults to '' (param-less production canvas) when the setting is unset", () => {
        mockEwCanvasBranchValue = undefined;

        expect(getEwCanvasBranch()).toBe('');
    });

    it('returns a custom branch verbatim', () => {
        mockEwCanvasBranchValue = 'main';

        expect(getEwCanvasBranch()).toBe('main');
    });

    it('returns an empty string when the user clears the setting (production form)', () => {
        mockEwCanvasBranchValue = '';

        expect(getEwCanvasBranch()).toBe('');
    });

    it('trims surrounding whitespace', () => {
        mockEwCanvasBranchValue = '  exp-workspace  ';

        expect(getEwCanvasBranch()).toBe('exp-workspace');
    });

    it('collapses a whitespace-only value to an empty string', () => {
        mockEwCanvasBranchValue = '   ';

        expect(getEwCanvasBranch()).toBe('');
    });

    it("falls back to '' when the setting is a non-string (corrupted settings)", () => {
        mockEwCanvasBranchValue = 3000;

        expect(getEwCanvasBranch()).toBe('');
    });

    it('reads from the demoBuilder.daLive configuration section', () => {
        getEwCanvasBranch();

        expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('demoBuilder.daLive');
    });
});
