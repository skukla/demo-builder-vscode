/**
 * Shared setup for the adobeMcpUpdateChecker family (ADR-016 / PL-14).
 *
 * The mock wall both suites need — the package file read and the GitHub release
 * lookup — plus the EDS project both were building and the mock handles both cast.
 *
 * Import this FIRST in a suite: the jest.mock calls register when this file's body
 * runs, which must happen before the subject binds to the real modules.
 */

jest.mock('vscode', () => ({}), { virtual: true });

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
}));

jest.mock('@/features/updates/services/githubApiClient', () => ({
    getLatestRelease: jest.fn(),
}));

import * as fsPromises from 'fs/promises';
import { COMPONENT_IDS } from '@/core/constants';
import { getLatestRelease } from '@/features/updates/services/githubApiClient';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

export { AdobeMcpUpdateChecker } from '@/features/updates/services/adobeMcpUpdateChecker';

export const readFileMock = fsPromises.readFile as jest.Mock;
export const getLatestReleaseMock = getLatestRelease as jest.Mock;

export const ADOBE_MCP_PKG = '@adobe-commerce/commerce-extensibility-tools';

/** A project with an EDS storefront that has a path — the shape the checker proceeds on. */
export function makeMcpProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'demo',
        path: '/projects/demo',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                status: 'ready',
                path: '/projects/demo/components/eds-storefront',
            },
        },
        ...overrides,
    });
}
