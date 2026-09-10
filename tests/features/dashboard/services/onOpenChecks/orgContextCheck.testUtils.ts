/**
 * Shared setup for the org-context check's two suites.
 *
 * `orgContextCheck.test.ts` drives the REAL detectProjectOrgMismatch;
 * `orgContextCheck-detectorCalls.test.ts` mocks it to see which calls happen at
 * all. That one difference is why they are two files — and it is the one thing
 * that cannot live here, because a `jest.mock` only hoists above the imports of
 * the module it is written in. Everything else they need is identical and lives
 * here: the auth fake with its P1 tripwires, the run context, the project
 * fixture and the factory call.
 */

import { createOrgContextCheck } from '@/features/dashboard/services/onOpenChecks/orgContextCheck';
import type { OrgContextCheckDeps } from '@/features/dashboard/services/onOpenChecks/orgContextCheck';
import type { OnOpenCheck, OnOpenCheckContext } from '@/features/dashboard/services/onOpenChecks/types';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { AdobeConfig, Project } from '@/types/base';
import { createMockAuthenticationService } from '../../../../helpers/authenticationServiceFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';

/**
 * Auth manager whose interactive / CLI surfaces THROW if touched.
 *
 * That is the P1 tripwire: opening a dashboard must never reach the CLI org
 * list (~14.5s, launches a browser) or an interactive login. Built on the
 * canonical fake so the members a suite does not name are present too.
 */
export function makeOrgContextAuth(
    overrides: Partial<jest.Mocked<AuthenticationService>> = {},
): jest.Mocked<AuthenticationService> {
    return createMockAuthenticationService({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([]),
        getOrganizations: jest.fn().mockImplementation(() => {
            throw new Error('CLI fallback path used on open (P1 violation)');
        }),
        loginAndRestoreProjectContext: jest.fn().mockImplementation(() => {
            throw new Error('interactive login used on open (P1 violation)');
        }),
        ...overrides,
    });
}

/** A run context with a captured `post` spy. */
export function makeOrgCheckContext(project: Project): { ctx: OnOpenCheckContext; post: jest.Mock } {
    const post = jest.fn();
    return { ctx: { project, logger: createMockLogger(), post }, post };
}

/** A project carrying (or deliberately lacking) an Adobe org. */
export function projectWithOrg(organization?: string, extra: Partial<AdobeConfig> = {}): Project {
    return createMockProject({
        path: '/tmp/proj',
        adobe: organization ? { organization, ...extra } : undefined,
    });
}

/** The check under test, with both of its dependencies handed in. */
export function buildOrgContextCheck(
    authManager: jest.Mocked<AuthenticationService>,
    stateManager: OrgContextCheckDeps['stateManager'],
): OnOpenCheck {
    return createOrgContextCheck({ authManager, stateManager });
}
