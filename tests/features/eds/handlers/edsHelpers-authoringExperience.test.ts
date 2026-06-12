/**
 * edsHelpers — resolveAuthoringExperience tests
 *
 * resolveAuthoringExperience picks the AEM authoring experience for a project
 * with a two-tier precedence:
 *   1. Per-project metadata value (if it is a recognized union member).
 *   2. Global setting demoBuilder.daLive.authoringExperience (default
 *      'da-live-classic').
 * Any unrecognized result coerces to 'da-live-classic' (fail-safe), so a
 * corrupted setting or stray metadata can never break the Author button.
 *
 * Mirrors the vscode getConfiguration mock pattern from
 * edsHelpers-byomOverlay.test.ts.
 */

// jest.mock factories are hoisted above imports; references inside must be
// prefixed `mock` and declared with `var`.
/* eslint-disable no-var */
var mockAuthoringExperienceValue: unknown;
/* eslint-enable no-var */

jest.mock('vscode', () => {
    mockAuthoringExperienceValue = undefined;  // honor the default
    return {
        workspace: {
            getConfiguration: jest.fn().mockReturnValue({
                get: jest.fn((key: string, defaultValue?: unknown) => {
                    if (key === 'authoringExperience') {
                        return mockAuthoringExperienceValue === undefined
                            ? defaultValue
                            : mockAuthoringExperienceValue;
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

import { resolveAuthoringExperience } from '@/features/eds/handlers/edsHelpers';
import * as vscode from 'vscode';

describe('resolveAuthoringExperience', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthoringExperienceValue = undefined;  // honor the default (UE)
    });

    it('returns da-live-classic when metadata is undefined and the global setting is unset (default)', () => {
        mockAuthoringExperienceValue = undefined;

        expect(resolveAuthoringExperience(undefined)).toBe('da-live-classic');
    });

    it('falls back to the global setting (experience-workspace) when metadata is undefined', () => {
        mockAuthoringExperienceValue = 'experience-workspace';

        expect(resolveAuthoringExperience(undefined)).toBe('experience-workspace');
    });

    it('lets the per-project value (experience-workspace) win over a global da-live-classic', () => {
        mockAuthoringExperienceValue = 'da-live-classic';

        expect(resolveAuthoringExperience('experience-workspace')).toBe('experience-workspace');
    });

    it('lets the per-project value (da-live-classic) win over a global experience-workspace', () => {
        mockAuthoringExperienceValue = 'experience-workspace';

        expect(resolveAuthoringExperience('da-live-classic')).toBe('da-live-classic');
    });

    it('coerces an unrecognized metadata value to da-live-classic (fail-safe)', () => {
        mockAuthoringExperienceValue = undefined;

        expect(resolveAuthoringExperience('garbage')).toBe('da-live-classic');
    });

    it('reads from the demoBuilder.daLive configuration section', () => {
        resolveAuthoringExperience(undefined);

        expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('demoBuilder.daLive');
    });
});
