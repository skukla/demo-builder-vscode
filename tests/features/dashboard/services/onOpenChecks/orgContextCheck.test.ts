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
import { CHECK_IDS } from '@/types/messages';
import type { CheckResult } from '@/features/dashboard/services/onOpenChecks/types';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { makeOrgContextAuth, buildOrgContextCheck, makeOrgCheckContext, projectWithOrg } from './orgContextCheck.testUtils';

/** The default self-heal sink; a test that asserts on it installs its own. */
let saveProjectConfigOnly = jest.fn().mockResolvedValue(undefined);

/** Build the check with a handed-in auth manager (and the current save sink). */
function checkWith(auth: jest.Mocked<AuthenticationService>) {
    return buildOrgContextCheck(auth, () => ({ saveProjectConfigOnly }));
}

beforeEach(() => {
    jest.clearAllMocks();
    saveProjectConfigOnly = jest.fn().mockResolvedValue(undefined);
});

it('has the org-context id and is reRunnable (live check, opts out of the guard)', () => {
    const orgContextCheck = checkWith(makeOrgContextAuth({}));
    expect(orgContextCheck.id).toBe(CHECK_IDS.ORG_CONTEXT);
    expect(orgContextCheck.reRunnable).toBe(true);
});

it('no Adobe org → ok no-op, without touching auth at all', async () => {
    const auth = makeOrgContextAuth({});
    const orgContextCheck = checkWith(auth);
    const { ctx } = makeOrgCheckContext(projectWithOrg(undefined));

    const outcome = await orgContextCheck.run(ctx);

    expect(outcome.status).toBe('ok');
    expect(auth.isAuthenticated).not.toHaveBeenCalled();
    expect(auth.getOrganizationsSdkOnly).not.toHaveBeenCalled();
});

it('valid token + matching org → ok with currentOrg; no CLI / no interactive path', async () => {
    const auth = makeOrgContextAuth({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([
            { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org One' },
        ]),
    });
    const orgContextCheck = checkWith(auth);
    const { ctx } = makeOrgCheckContext(projectWithOrg('org1'));

    const outcome = await orgContextCheck.run(ctx) as CheckResult<{ currentOrg?: string }>;

    expect(outcome.status).toBe('ok');
    expect(outcome.data?.currentOrg).toBe('Org One');
    expect(auth.getOrganizations).not.toHaveBeenCalled();
    expect(auth.loginAndRestoreProjectContext).not.toHaveBeenCalled();
});

it('posts a pending outcome before resolving', async () => {
    const auth = makeOrgContextAuth({
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([{ id: 'org1', name: 'Org One' }]),
    });
    const orgContextCheck = checkWith(auth);
    const { ctx, post } = makeOrgCheckContext(projectWithOrg('org1'));

    await orgContextCheck.run(ctx);

    expect(post).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
});

it('valid token + mismatch → warning with orgMismatch banner data', async () => {
    const auth = makeOrgContextAuth({
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([
            { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org One' },
        ]),
    });
    const orgContextCheck = checkWith(auth);
    // Project expects an org the token can't reach.
    const { ctx } = makeOrgCheckContext(projectWithOrg('orgX', { organizationName: 'Expected Org' }));

    const outcome = await orgContextCheck.run(ctx) as CheckResult<{ orgMismatch?: { expectedOrg: string; currentOrg?: string } }>;

    expect(outcome.status).toBe('warning');
    expect(outcome.message).toBeTruthy();
    expect(outcome.data?.orgMismatch?.expectedOrg).toBe('orgX');
    expect(outcome.data?.orgMismatch?.currentOrg).toBe('Org One');
});

it('absent/expired token → unknown; SDK read NOT attempted, no interactive login', async () => {
    const auth = makeOrgContextAuth({
        isAuthenticated: jest.fn().mockResolvedValue(false),
    });
    const orgContextCheck = checkWith(auth);
    const { ctx } = makeOrgCheckContext(projectWithOrg('org1'));

    const outcome = await orgContextCheck.run(ctx);

    expect(outcome.status).toBe('unknown');
    expect(outcome.message).toMatch(/sign in/i);
    expect(auth.getOrganizationsSdkOnly).not.toHaveBeenCalled();
    expect(auth.loginAndRestoreProjectContext).not.toHaveBeenCalled();
});

it('SDK unavailable (undefined SDK-only read) → unknown; no CLI fallback fired', async () => {
    // `undefined` means the SDK could not answer (cold, timeout, error) — that is
    // the only case where "Sign in to check" is honest.
    const auth = makeOrgContextAuth({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue(undefined),
    });
    const orgContextCheck = checkWith(auth);
    const { ctx } = makeOrgCheckContext(projectWithOrg('org1'));

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
    const auth = makeOrgContextAuth({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([]),
    });
    const orgContextCheck = checkWith(auth);
    const { ctx } = makeOrgCheckContext(projectWithOrg('orgX', { organizationName: 'Expected Org' }));

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

it('no state manager yet → the self-heal write is skipped and the check still resolves ok', async () => {
    const auth = makeOrgContextAuth({
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([
            { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org One' },
        ]),
    });
    // Resolved lazily and may not exist yet; nothing to write to is not an error.
    const orgContextCheck = buildOrgContextCheck(auth, () => null);
    const project = projectWithOrg('Org One');

    const outcome = await orgContextCheck.run(makeOrgCheckContext(project).ctx);

    expect(outcome.status).toBe('ok');
    expect(saveProjectConfigOnly).not.toHaveBeenCalled();
    // The in-memory heal still happened; only the persistence was skipped.
    expect((project.adobe as { organization?: string }).organization).toBe('org1');
});

it('reachable + org data already correct → no manifest write at all', async () => {
    const auth = makeOrgContextAuth({
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([
            { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org One' },
        ]),
    });
    const orgContextCheck = checkWith(auth);
    // Both fields already hold what the token reaches — nothing to heal.
    const project = projectWithOrg('org1', { organizationName: 'Org One' });
    const { ctx } = makeOrgCheckContext(project);

    const outcome = await orgContextCheck.run(ctx);

    expect(outcome.status).toBe('ok');
    expect(saveProjectConfigOnly).not.toHaveBeenCalled();
});

it('reachable + stale org NAME only → heals the name and writes once', async () => {
    const auth = makeOrgContextAuth({
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([
            { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org One' },
        ]),
    });
    const orgContextCheck = checkWith(auth);
    // The id is already canonical; only the persisted name is out of date.
    const project = projectWithOrg('org1', { organizationName: 'Stale Name' });
    const { ctx } = makeOrgCheckContext(project);

    const outcome = await orgContextCheck.run(ctx);

    expect(outcome.status).toBe('ok');
    expect(saveProjectConfigOnly).toHaveBeenCalledTimes(1);
    expect((project.adobe as { organizationName?: string }).organizationName).toBe('Org One');
    expect((project.adobe as { organization?: string }).organization).toBe('org1');
});

it('mismatch with no persisted name → names the org only when the stored value is a human name', async () => {
    const auth = makeOrgContextAuth({
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([
            { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org One' },
        ]),
    });
    const orgContextCheck = checkWith(auth);

    // An id/code never has whitespace, so there is no human name to show.
    const byId = (await checkWith(auth).run(
        makeOrgCheckContext(projectWithOrg('orgX')).ctx,
    )) as CheckResult<{ orgMismatch?: { expectedOrgName?: string } }>;
    // A legacy project stored the NAME in the id field — whitespace gives it away.
    const byName = (await orgContextCheck.run(
        makeOrgCheckContext(projectWithOrg('Legacy Org Name')).ctx,
    )) as CheckResult<{ orgMismatch?: { expectedOrgName?: string } }>;

    expect(byId.status).toBe('warning');
    expect(byId.data?.orgMismatch?.expectedOrgName).toBeUndefined();
    expect(byName.status).toBe('warning');
    expect(byName.data?.orgMismatch?.expectedOrgName).toBe('Legacy Org Name');
});

it('reachable + legacy/name data → self-heals project org id + name (one manifest write)', async () => {
    saveProjectConfigOnly = jest.fn().mockResolvedValue(undefined);
    const auth = makeOrgContextAuth({
        getOrganizationsSdkOnly: jest.fn().mockResolvedValue([
            { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org One' },
        ]),
    });
    const orgContextCheck = checkWith(auth);
    // Legacy: organization holds the NAME, not the id; no organizationName yet.
    const project = projectWithOrg('Org One');
    const { ctx } = makeOrgCheckContext(project);

    const outcome = await orgContextCheck.run(ctx);

    expect(outcome.status).toBe('ok');
    expect(saveProjectConfigOnly).toHaveBeenCalledTimes(1);
    expect((project.adobe as { organization?: string }).organization).toBe('org1');
    expect((project.adobe as { organizationName?: string }).organizationName).toBe('Org One');
});
