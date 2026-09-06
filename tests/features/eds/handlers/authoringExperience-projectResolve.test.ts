/**
 * authoringExperience — resolveProjectAuthoringExperience tests
 *
 * The Author button asks this for EVERY project, including ones that have no
 * EDS storefront and ones that are not loaded yet. Each hop down to the
 * metadata is therefore optional, and a project missing any of them must
 * resolve to the global default rather than throw — a throw here takes out the
 * dashboard row that renders the button.
 *
 * Mirrors the vscode getConfiguration mock pattern from
 * authoringExperience.test.ts.
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

import {
    resolveProjectAuthoringExperience,
} from './authoringExperience.testUtils';
import { createMockProject, edsStorefrontInstance } from '../../../helpers/projectFake';
import type { Project } from '@/types/base';

/** A project whose EDS storefront carries the given authoringExperience metadata. */
function projectWithEdsMetadata(metadata: Record<string, unknown> | undefined): Project {
    return createMockProject({
        componentInstances: {
            'eds-storefront': {
                ...edsStorefrontInstance(),
                ...(metadata === undefined ? {} : { metadata }),
            },
        },
    });
}

describe('resolveProjectAuthoringExperience', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthoringExperienceValue = undefined;  // honor the default
    });

    it("reads the EDS storefront instance's authoringExperience metadata", () => {
        mockAuthoringExperienceValue = 'da-live-classic';

        const project = projectWithEdsMetadata({ authoringExperience: 'experience-workspace' });

        expect(resolveProjectAuthoringExperience(project)).toBe('experience-workspace');
    });

    it('falls back to the global setting when the storefront carries no metadata', () => {
        mockAuthoringExperienceValue = 'experience-workspace';

        const project = projectWithEdsMetadata(undefined);

        expect(resolveProjectAuthoringExperience(project)).toBe('experience-workspace');
    });

    it('falls back to the global setting for a project with no EDS storefront', () => {
        mockAuthoringExperienceValue = 'experience-workspace';

        const project = createMockProject({ componentInstances: {} });

        expect(resolveProjectAuthoringExperience(project)).toBe('experience-workspace');
    });

    it('resolves — rather than throwing — for a project with no componentInstances at all', () => {
        mockAuthoringExperienceValue = 'experience-workspace';

        // A manifest written before componentInstances existed, or a partially
        // loaded project. Reaching through it must not throw.
        const project = createMockProject();
        delete (project as Partial<Project>).componentInstances;

        expect(resolveProjectAuthoringExperience(project)).toBe('experience-workspace');
    });

    it('resolves to the global default for undefined and null projects', () => {
        mockAuthoringExperienceValue = 'experience-workspace';

        expect(resolveProjectAuthoringExperience(undefined)).toBe('experience-workspace');
        expect(resolveProjectAuthoringExperience(null)).toBe('experience-workspace');
    });
});
