/**
 * Shared fixtures for the appManagementInstaller suites.
 *
 * No module mocks live here and none are needed: the installer takes its client,
 * auth, progress and pacing as dependencies, so every suite hands them in.
 *
 * URL fixtures are the LIVE shape from the 2026-08-27 kit deploy
 * (aio app get-url --json → adobeioruntime.net web-action URLs).
 */

import type {
    AppManagementInstallDeps,
    InstallerClient,
} from '@/features/app-builder/services/appManagementInstaller';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';

export const NS_BASE = 'https://285361-kuklabodeamesh5ngv-stage.adobeioruntime.net/api/v1/web';

/** Live-shaped deployedUrls: package-qualified action keys → web action URLs. */
export const DEPLOYED_URLS = {
    'starter-kit/info': `${NS_BASE}/starter-kit/info`,
    'app-management/installation': `${NS_BASE}/app-management/installation`,
    'app-management/association': `${NS_BASE}/app-management/association`,
};

/** A PaaS project with the full Adobe context (field names from types/base.ts). */
export function paasProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'demo',
        path: '/tmp/demo',
        adobe: {
            organization: '285361',
            organizationName: 'Kukla Org',
            projectId: 'p-1',
            projectName: 'KuklaBodeaMesh5NgV',
            projectTitle: 'Kukla Bodea Mesh',
            workspace: 'w-1',
            workspaceName: 'Stage',
            workspaceTitle: 'Stage',
        },
        componentSelections: { backend: 'adobe-commerce-paas' },
        componentConfigs: {
            'adobe-commerce-paas': {
                ADOBE_COMMERCE_URL: 'https://demo.example.com/',
            },
        },
        ...overrides,
    });
}

export function makeClient(overrides: Partial<jest.Mocked<InstallerClient>> = {}) {
    return {
        getInstallationState: jest.fn().mockResolvedValue({ id: 'i1', status: 'succeeded' }),
        reconcileInstallation: jest.fn().mockResolvedValue({ operation: 'install', message: 'ok' }),
        setAssociation: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    } as jest.Mocked<InstallerClient>;
}

export function makeDeps(
    client: InstallerClient,
    overrides: Partial<AppManagementInstallDeps> = {}
): AppManagementInstallDeps {
    return {
        getAuth: jest.fn().mockResolvedValue({
            accessToken: 'fake-test-pw-not-a-secret',
            imsOrgId: 'ABC@AdobeOrg',
        }),
        logger: createMockLogger(),
        clientFactory: () => client,
        wait: async () => undefined,
        ...overrides,
    };
}
