/**
 * Tests for the org-context on-open check (Step 2b) — the P1 surprise-browser fix.
 *
 * The contract under test: on open the check uses ONLY non-interactive probes
 * (`isAuthenticated` token check + SDK-only org read) and maps to ok / warning /
 * unknown. It must NEVER call the interactive auth guard or the CLI org-list
 * fallback (the two paths that launch a browser / stall ~14.5s). A degraded
 * state (no token, SDK cold) resolves to `unknown` ("sign in to check"), never a
 * prompt. The canonical `detectProjectOrgMismatch` / `ensureOrgContext` logic is
 * exercised for real (pure given an injected org list).
 */

jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
        getStateManager: jest.fn(),
    },
}));

import { orgContextCheck } from '@/features/dashboard/services/onOpenChecks/orgContextCheck';
import { ServiceLocator } from '@/core/di';
import { CHECK_IDS } from '@/types/messages';
import type { CheckOutcome, OnOpenCheckContext } from '@/features/dashboard/services/onOpenChecks';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

const mockLogger: Logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
};

/** Build a run context with a captured `post` spy. */
function makeCtx(project: Project): { ctx: OnOpenCheckContext; post: jest.Mock } {
    const post = jest.fn();
    return { ctx: { project, logger: mockLogger, post }, post };
}

/** Auth manager whose interactive / CLI surfaces THROW if touched (P1 tripwire). */
function makeAuth(overrides: Record<string, unknown>) {
    return {
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([]),
        // These MUST NOT be called on open — fail loudly if they are.
        getOrganizations: jest.fn(() => { throw new Error('CLI fallback path used on open (P1 violation)'); }),
        loginAndRestoreProjectContext: jest.fn(() => { throw new Error('interactive login used on open (P1 violation)'); }),
        ...overrides,
    };
}

function projectWithOrg(organization?: string, extra: Record<string, unknown> = {}): Project {
    return { path: '/tmp/proj', adobe: organization ? { organization, ...extra } : undefined } as unknown as Project;
}

beforeEach(() => {
    jest.clearAllMocks();
    (ServiceLocator.getStateManager as jest.Mock).mockReturnValue({
        saveProjectConfigOnly: jest.fn().mockResolvedValue(undefined),
    });
});

it('has the org-context id and is reRunnable (live check, opts out of the guard)', () => {
    expect(orgContextCheck.id).toBe(CHECK_IDS.ORG_CONTEXT);
    expect(orgContextCheck.reRunnable).toBe(true);
});

it('no Adobe org → ok no-op, without touching auth at all', async () => {
    const auth = makeAuth({});
    (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(auth);
    const { ctx } = makeCtx(projectWithOrg(undefined));

    const outcome = await orgContextCheck.run(ctx);

    expect(outcome.status).toBe('ok');
    expect(auth.isAuthenticated).not.toHaveBeenCalled();
    expect(auth.getOrganizationsSdkOnly).not.toHaveBeenCalled();
});

it('valid token + matching org → ok with currentOrg; no CLI / no interactive path', async () => {
    const auth = makeAuth({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([
            { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org One' },
        ]),
    });
    (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(auth);
    const { ctx } = makeCtx(projectWithOrg('org1'));

    const outcome = await orgContextCheck.run(ctx) as CheckOutcome<{ currentOrg?: string }>;

    expect(outcome.status).toBe('ok');
    expect(outcome.data?.currentOrg).toBe('Org One');
    expect(auth.getOrganizations).not.toHaveBeenCalled();
    expect(auth.loginAndRestoreProjectContext).not.toHaveBeenCalled();
});

it('posts a pending outcome before resolving', async () => {
    const auth = makeAuth({
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([{ id: 'org1', name: 'Org One' }]),
    });
    (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(auth);
    const { ctx, post } = makeCtx(projectWithOrg('org1'));

    await orgContextCheck.run(ctx);

    expect(post).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
});

it('valid token + mismatch → warning with orgMismatch banner data', async () => {
    const auth = makeAuth({
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([
            { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org One' },
        ]),
    });
    (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(auth);
    // Project expects an org the token can't reach.
    const { ctx } = makeCtx(projectWithOrg('orgX', { organizationName: 'Expected Org' }));

    const outcome = await orgContextCheck.run(ctx) as CheckOutcome<{ orgMismatch?: { expectedOrg: string; currentOrg?: string } }>;

    expect(outcome.status).toBe('warning');
    expect(outcome.message).toBeTruthy();
    expect(outcome.data?.orgMismatch?.expectedOrg).toBe('orgX');
    expect(outcome.data?.orgMismatch?.currentOrg).toBe('Org One');
});

it('absent/expired token → unknown; SDK read NOT attempted, no interactive login', async () => {
    const auth = makeAuth({
        isAuthenticated: jest.fn().mockResolvedValue(false),
    });
    (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(auth);
    const { ctx } = makeCtx(projectWithOrg('org1'));

    const outcome = await orgContextCheck.run(ctx);

    expect(outcome.status).toBe('unknown');
    expect(outcome.message).toMatch(/sign in/i);
    expect(auth.getOrganizationsSdkOnly).not.toHaveBeenCalled();
    expect(auth.loginAndRestoreProjectContext).not.toHaveBeenCalled();
});

it('SDK unavailable (empty SDK-only read) → unknown; no CLI fallback fired', async () => {
    const auth = makeAuth({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([]),
    });
    (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(auth);
    const { ctx } = makeCtx(projectWithOrg('org1'));

    const outcome = await orgContextCheck.run(ctx);

    expect(outcome.status).toBe('unknown');
    expect(auth.getOrganizations).not.toHaveBeenCalled();
});

it('reachable + legacy/name data → self-heals project org id + name (one manifest write)', async () => {
    const saveProjectConfigOnly = jest.fn().mockResolvedValue(undefined);
    (ServiceLocator.getStateManager as jest.Mock).mockReturnValue({ saveProjectConfigOnly });
    const auth = makeAuth({
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([
            { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org One' },
        ]),
    });
    (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(auth);
    // Legacy: organization holds the NAME, not the id; no organizationName yet.
    const project = projectWithOrg('Org One');
    const { ctx } = makeCtx(project);

    const outcome = await orgContextCheck.run(ctx);

    expect(outcome.status).toBe('ok');
    expect(saveProjectConfigOnly).toHaveBeenCalledTimes(1);
    expect((project.adobe as { organization?: string }).organization).toBe('org1');
    expect((project.adobe as { organizationName?: string }).organizationName).toBe('Org One');
});
