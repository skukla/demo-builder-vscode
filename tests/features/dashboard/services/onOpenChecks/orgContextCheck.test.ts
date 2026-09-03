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

/**
 * CONVERTED 2026-08-28 (ADR-015): the check is a `createOrgContextCheck(deps)`
 * factory now, matching its mesh/mcp/ai siblings — so this suite mocks the
 * service registry NOT AT ALL. The auth manager and state manager are plain
 * fakes handed in. Every assertion below is unchanged.
 */
import { createOrgContextCheck } from '@/features/dashboard/services/onOpenChecks/orgContextCheck';
import { CHECK_IDS } from '@/types/messages';
import type { CheckResult, OnOpenCheckContext } from '@/features/dashboard/services/onOpenChecks/types';
import type { AdobeConfig, Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { createMockAuthenticationService } from '../../../../helpers/authenticationServiceFake';
import { createMockProject } from '../../../../helpers/projectFake';
const mockLogger: Logger = createMockLogger();

/** Build a run context with a captured `post` spy. */
function makeCtx(project: Project): { ctx: OnOpenCheckContext; post: jest.Mock } {
    const post = jest.fn();
    return { ctx: { project, logger: mockLogger, post }, post };
}

/** Auth manager whose interactive / CLI surfaces THROW if touched (P1 tripwire). */
function makeAuth(overrides: Partial<jest.Mocked<AuthenticationService>> = {}) {
    // Built on the canonical fake so the members this suite does NOT name are
    // present too — the literal it replaces had four, and the check under test
    // reaches for more than four.
    return createMockAuthenticationService({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([]),
        // These MUST NOT be called on open — fail loudly if they are.
        getOrganizations: jest.fn().mockImplementation(() => {
            throw new Error('CLI fallback path used on open (P1 violation)');
        }),
        loginAndRestoreProjectContext: jest.fn().mockImplementation(() => {
            throw new Error('interactive login used on open (P1 violation)');
        }),
        ...overrides,
    });
}

function projectWithOrg(organization?: string, extra: Partial<AdobeConfig> = {}): Project {
    return createMockProject({ path: '/tmp/proj', adobe: organization ? { organization, ...extra } : undefined });
}

/** The default self-heal sink; a test that asserts on it installs its own. */
let saveProjectConfigOnly = jest.fn().mockResolvedValue(undefined);

/** Build the check with a handed-in auth manager (and the current save sink). */
function checkWith(auth: jest.Mocked<AuthenticationService>) {
    return createOrgContextCheck({
        authManager: auth,
        stateManager: () => ({ saveProjectConfigOnly }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    saveProjectConfigOnly = jest.fn().mockResolvedValue(undefined);
});

it('has the org-context id and is reRunnable (live check, opts out of the guard)', () => {
    const orgContextCheck = checkWith(makeAuth({}));
    expect(orgContextCheck.id).toBe(CHECK_IDS.ORG_CONTEXT);
    expect(orgContextCheck.reRunnable).toBe(true);
});

it('no Adobe org → ok no-op, without touching auth at all', async () => {
    const auth = makeAuth({});
    const orgContextCheck = checkWith(auth);
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
    const orgContextCheck = checkWith(auth);
    const { ctx } = makeCtx(projectWithOrg('org1'));

    const outcome = await orgContextCheck.run(ctx) as CheckResult<{ currentOrg?: string }>;

    expect(outcome.status).toBe('ok');
    expect(outcome.data?.currentOrg).toBe('Org One');
    expect(auth.getOrganizations).not.toHaveBeenCalled();
    expect(auth.loginAndRestoreProjectContext).not.toHaveBeenCalled();
});

it('posts a pending outcome before resolving', async () => {
    const auth = makeAuth({
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([{ id: 'org1', name: 'Org One' }]),
    });
    const orgContextCheck = checkWith(auth);
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
    const orgContextCheck = checkWith(auth);
    // Project expects an org the token can't reach.
    const { ctx } = makeCtx(projectWithOrg('orgX', { organizationName: 'Expected Org' }));

    const outcome = await orgContextCheck.run(ctx) as CheckResult<{ orgMismatch?: { expectedOrg: string; currentOrg?: string } }>;

    expect(outcome.status).toBe('warning');
    expect(outcome.message).toBeTruthy();
    expect(outcome.data?.orgMismatch?.expectedOrg).toBe('orgX');
    expect(outcome.data?.orgMismatch?.currentOrg).toBe('Org One');
});

it('absent/expired token → unknown; SDK read NOT attempted, no interactive login', async () => {
    const auth = makeAuth({
        isAuthenticated: jest.fn().mockResolvedValue(false),
    });
    const orgContextCheck = checkWith(auth);
    const { ctx } = makeCtx(projectWithOrg('org1'));

    const outcome = await orgContextCheck.run(ctx);

    expect(outcome.status).toBe('unknown');
    expect(outcome.message).toMatch(/sign in/i);
    expect(auth.getOrganizationsSdkOnly).not.toHaveBeenCalled();
    expect(auth.loginAndRestoreProjectContext).not.toHaveBeenCalled();
});

it('SDK unavailable (undefined SDK-only read) → unknown; no CLI fallback fired', async () => {
    // `undefined` means the SDK could not answer (cold, timeout, error) — that is
    // the only case where "Sign in to check" is honest.
    const auth = makeAuth({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue(undefined),
    });
    const orgContextCheck = checkWith(auth);
    const { ctx } = makeCtx(projectWithOrg('org1'));

    const outcome = await orgContextCheck.run(ctx);

    expect(outcome.status).toBe('unknown');
    expect(auth.getOrganizations).not.toHaveBeenCalled();
});

it('token valid but SDK answers ZERO orgs → warning with the Switch IMS Org recovery', async () => {
    // Regression (2026-08-13, Leah): a valid token whose landed org exposes no
    // Developer Console orgs returned `[]` from a SUCCESSFUL SDK read. The check
    // mapped it to `unknown` ("Sign in to check"), whose recovery is a NON-forced
    // login — which silently reuses the same browser SSO session and can never
    // change the outcome. A genuine empty answer must surface the mismatch banner
    // instead: its forced "Switch IMS Org" login shows the account/org chooser.
    const auth = makeAuth({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([]),
    });
    const orgContextCheck = checkWith(auth);
    const { ctx } = makeCtx(projectWithOrg('orgX', { organizationName: 'Expected Org' }));

    const outcome = (await orgContextCheck.run(ctx)) as CheckResult<{
        orgMismatch?: { expectedOrg: string; expectedOrgName?: string; currentOrg?: string };
    }>;

    expect(outcome.status).toBe('warning');
    expect(outcome.data?.orgMismatch?.expectedOrg).toBe('orgX');
    expect(outcome.data?.orgMismatch?.expectedOrgName).toBe('Expected Org');
    expect(outcome.data?.orgMismatch?.currentOrg).toBeUndefined();
    expect(auth.getOrganizations).not.toHaveBeenCalled();
    expect(auth.loginAndRestoreProjectContext).not.toHaveBeenCalled();
});

it('reachable + legacy/name data → self-heals project org id + name (one manifest write)', async () => {
    saveProjectConfigOnly = jest.fn().mockResolvedValue(undefined);
    const auth = makeAuth({
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([
            { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org One' },
        ]),
    });
    const orgContextCheck = checkWith(auth);
    // Legacy: organization holds the NAME, not the id; no organizationName yet.
    const project = projectWithOrg('Org One');
    const { ctx } = makeCtx(project);

    const outcome = await orgContextCheck.run(ctx);

    expect(outcome.status).toBe('ok');
    expect(saveProjectConfigOnly).toHaveBeenCalledTimes(1);
    expect((project.adobe as { organization?: string }).organization).toBe('org1');
    expect((project.adobe as { organizationName?: string }).organizationName).toBe('Org One');
});
