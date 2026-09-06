/**
 * org-context check — WHEN the canonical detector is called at all.
 *
 * Split from `orgContextCheck.test.ts` because it needs the opposite fixture: that
 * suite drives the real `detectProjectOrgMismatch` and can therefore never see
 * whether a given outcome came from the SDK guard or from the detector answering
 * the same way afterwards. Both routes end in `unknown`, so the short-circuit is
 * invisible unless the detector is a spy.
 *
 * Two decisions are pinned here:
 *   - an SDK read that could not answer (`undefined`) resolves to `unknown`
 *     WITHOUT running the detector — the P1 rule is that nothing else is probed,
 *   - a detector that cannot resolve a mismatch resolves to `unknown` rather
 *     than reading `reachable` off nothing.
 *
 * The positive case asserts the ARGUMENTS the detector receives: an org source
 * that hands back exactly the SDK-only list, never the CLI-backed one.
 */

import { detectProjectOrgMismatch } from '@/features/authentication/services/detectProjectOrgMismatch';
import { createOrgContextCheck } from '@/features/dashboard/services/onOpenChecks/orgContextCheck';
import type { OnOpenCheckContext } from '@/features/dashboard/services/onOpenChecks/types';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { Project } from '@/types/base';
import { createMockAuthenticationService } from '../../../../helpers/authenticationServiceFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';

jest.mock('@/features/authentication/services/detectProjectOrgMismatch');

const detect = detectProjectOrgMismatch as jest.MockedFunction<typeof detectProjectOrgMismatch>;

function makeAuth(overrides: Partial<jest.Mocked<AuthenticationService>>) {
    return createMockAuthenticationService({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        ...overrides,
    });
}

function makeCtx(project: Project): OnOpenCheckContext {
    return { project, logger: createMockLogger(), post: jest.fn() };
}

function checkWith(auth: jest.Mocked<AuthenticationService>) {
    return createOrgContextCheck({
        authManager: auth,
        stateManager: () => ({ saveProjectConfigOnly: jest.fn().mockResolvedValue(undefined) }),
    });
}

const project = (): Project =>
    createMockProject({ path: '/tmp/proj', adobe: { organization: 'org1' } });

// The module mock is created once at import time; reset it per test so a call
// recorded by a previous one cannot be read as this one's.
beforeEach(() => detect.mockReset());

it('an SDK read that cannot answer resolves to unknown without running the detector', async () => {
    const auth = makeAuth({ getOrganizationsSdkOnly: jest.fn().mockResolvedValue(undefined) });

    const outcome = await checkWith(auth).run(makeCtx(project()));

    expect(outcome.status).toBe('unknown');
    expect(detect).not.toHaveBeenCalled();
});

it('a detector that cannot resolve a mismatch resolves to unknown', async () => {
    const auth = makeAuth({ getOrganizationsSdkOnly: jest.fn().mockResolvedValue([]) });
    detect.mockResolvedValue(undefined);

    const outcome = await checkWith(auth).run(makeCtx(project()));

    expect(outcome.status).toBe('unknown');
    expect(detect).toHaveBeenCalledTimes(1);
});

it('hands the detector an org source that returns the SDK-only list', async () => {
    const orgs = [{ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org One' }];
    const auth = makeAuth({ getOrganizationsSdkOnly: jest.fn().mockResolvedValue(orgs) });
    detect.mockResolvedValue({ reachable: true, expectedOrg: 'org1', currentOrg: 'Org One' });
    const ctx = makeCtx(project());

    await checkWith(auth).run(ctx);

    const [source, passedProject, passedLogger] = detect.mock.calls[0];
    await expect(source.getOrganizations()).resolves.toBe(orgs);
    expect(passedProject).toBe(ctx.project);
    expect(passedLogger).toBe(ctx.logger);
    // The CLI-backed reader is never the source handed over.
    expect(auth.getOrganizations).not.toHaveBeenCalled();
});
