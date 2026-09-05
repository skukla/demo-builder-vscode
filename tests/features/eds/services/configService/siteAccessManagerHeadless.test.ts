/**
 * siteAccessManagerHeadless tests — the UI-free core behind the "manage site
 * access" command (and any future MCP tool).
 *
 * The behaviour that matters is that every mutation is CONFIRMED by a re-read.
 * A 200 from the write is not proof the role landed; the refused user's own
 * config read flipping is (that lesson is the whole reason this feature exists).
 */

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getDaLiveAuthService: jest.fn(() => ({ getUserEmail: jest.fn() })),
}));

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => ({
        getAccessToken: jest.fn().mockResolvedValue('ims-token'),
    })),
}));

jest.mock('@/features/eds/services/configService/configServiceAccess', () => ({
    readSiteAccess: jest.fn(),
    readOrgAdmins: jest.fn(),
    ensureSiteAdmin: jest.fn(),
    revokeSiteAdmin: jest.fn(),
    probeConfigWriteAccess: jest.fn(),
}));

import {
    addSiteAdmin,
    listSiteAccess,
    removeSiteAdmin,
} from '@/features/eds/services/configService/siteAccessManagerHeadless';
import { createMockExtensionContext } from '../../../../helpers/extensionContextFake';
import {
    ensureSiteAdmin,
    probeConfigWriteAccess,
    readOrgAdmins,
    readSiteAccess,
    revokeSiteAdmin,
} from '@/features/eds/services/configService/configServiceAccess';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';

const mockReadSiteAccess = readSiteAccess as jest.Mock;
const mockReadOrgAdmins = readOrgAdmins as jest.Mock;
const mockEnsure = ensureSiteAdmin as jest.Mock;
const mockRevoke = revokeSiteAdmin as jest.Mock;
const mockProbe = probeConfigWriteAccess as jest.Mock;

const logger = createMockLogger();

/**
 * The canonical `ExtensionContext` fake. This was `{} as never` — a claim that an
 * empty object is an `ExtensionContext`, which cost 16 checks across this suite,
 * because a `never` argument makes the compiler stop reading the whole call.
 */
const context = createMockExtensionContext();

/**
 * An EDS project whose storefront points at skukla/bodea-source.
 *
 * Shape copied from what `getEdsGithubRepo` actually reads — `selectedStack`
 * must be an EDS stack (isEdsProject gates on it) and the repo lives on
 * `componentInstances['eds-storefront'].metadata.githubRepo`. An invented shape
 * here resolves to "no site" and every assertion fails for the wrong reason.
 */
const project = createMockProject({
    name: 'bodea',
    path: '/tmp/bodea',
    selectedStack: 'eds-accs',
    componentInstances: {
        'eds-storefront': { id: 'eds-storefront', name: 'eds-storefront', status: 'ready', metadata: { githubRepo: 'skukla/bodea-source' } },
    },
});

beforeEach(() => {
    jest.clearAllMocks();
    mockProbe.mockResolvedValue('granted');
    mockReadSiteAccess.mockResolvedValue({ status: 'ok', roles: { admin: ['a@adobe.com'] } });
    mockReadOrgAdmins.mockResolvedValue({ status: 'ok', admins: ['owner@adobe.com'] });
});

describe('listSiteAccess', () => {
    it('returns the site admins, the org admins, and whether we can manage', async () => {
        const result = await listSiteAccess(project, context, logger);

        expect(result.status).toBe('ok');
        expect(result.siteAdmins).toEqual(['a@adobe.com']);
        expect(result.orgAdmins).toEqual(['owner@adobe.com']);
        expect(result.canManage).toBe(true);
    });

    it('reports not_authorized when this identity cannot read the config', async () => {
        // The manage UI must not offer buttons that will 403 on click.
        mockProbe.mockResolvedValue('refused');

        const result = await listSiteAccess(project, context, logger);

        expect(result.status).toBe('not_authorized');
        expect(result.canManage).toBe(false);
    });

    it('fails cleanly for a project with no EDS storefront repo', async () => {
        const noRepo = createMockProject({
            name: 'x',
            path: '/tmp/x',
            selectedStack: 'eds-accs',
            componentInstances: {},
        });

        const result = await listSiteAccess(noRepo, context, logger);

        expect(result.status).toBe('no_site');
    });
});

describe('addSiteAdmin', () => {
    it('confirms the grant with a re-read rather than trusting the write', async () => {
        mockEnsure.mockResolvedValue({ status: 'ok', changed: true });
        // `ensureSiteAdmin` is mocked, so it does not issue its own read — the
        // single readSiteAccess call here IS the post-write verification.
        mockReadSiteAccess.mockResolvedValue({
            status: 'ok',
            roles: { admin: ['a@adobe.com', 'new@adobe.com'] },
        });

        const result = await addSiteAdmin(project, 'new@adobe.com', context, logger);

        expect(result.status).toBe('ok');
        expect(result.verified).toBe(true);
        expect(result.siteAdmins).toContain('new@adobe.com');
    });

    it('reports NOT verified when the write claims success but the read disagrees', async () => {
        // A silent no-op upstream would otherwise be reported as a fix, which is
        // the exact failure this whole batch exists to stop.
        mockEnsure.mockResolvedValue({ status: 'ok', changed: true });
        mockReadSiteAccess.mockResolvedValue({ status: 'ok', roles: { admin: ['a@adobe.com'] } });

        const result = await addSiteAdmin(project, 'new@adobe.com', context, logger);

        expect(result.verified).toBe(false);
    });

    it('surfaces a refusal without claiming anything changed', async () => {
        mockEnsure.mockResolvedValue({ status: 'not_authorized' });

        const result = await addSiteAdmin(project, 'new@adobe.com', context, logger);

        expect(result.status).toBe('not_authorized');
        expect(result.verified).toBe(false);
    });

    it('rejects an obviously invalid email before calling the API', async () => {
        const result = await addSiteAdmin(project, 'not-an-email', context, logger);

        expect(result.status).toBe('invalid');
        expect(mockEnsure).not.toHaveBeenCalled();
    });
});

describe('removeSiteAdmin', () => {
    it('confirms the removal with a re-read', async () => {
        mockRevoke.mockResolvedValue({ status: 'ok', changed: true });
        // Post-write verification read (revoke itself is mocked).
        mockReadSiteAccess.mockResolvedValue({
            status: 'ok',
            roles: { admin: ['a@adobe.com'] },
        });

        const result = await removeSiteAdmin(project, 'gone@adobe.com', context, logger);

        expect(result.status).toBe('ok');
        expect(result.verified).toBe(true);
        expect(result.siteAdmins).not.toContain('gone@adobe.com');
    });

    it('passes through the last-admin refusal', async () => {
        mockRevoke.mockResolvedValue({ status: 'invalid', error: 'cannot remove the last admin' });

        const result = await removeSiteAdmin(project, 'only@adobe.com', context, logger);

        expect(result.status).toBe('invalid');
        expect(result.error).toMatch(/last admin/i);
    });
});

/**
 * A drifted-shape read must never look like an answer.
 *
 * `readSiteAccess` reports an unreadable body as a non-ok STATUS. These pin the
 * two consumer sites that previously keyed off the value instead and so read a
 * drifted body as "this site has no admins" (verify-loop iteration 2).
 */
describe('unreadable role map is never reported as an answer', () => {
    it('listSiteAccess reports failed rather than an empty admin list', async () => {
        mockReadSiteAccess.mockResolvedValue({ status: 'failed', error: 'no role map' });

        const result = await listSiteAccess(project, context, logger);

        expect(result.status).toBe('failed');
        expect(result.siteAdmins).toBeUndefined();
        expect(result.canManage).toBe(false);
    });

    it('removeSiteAdmin does NOT report verified when the re-read is unreadable', async () => {
        // The revoke predicate ("nobody in the list matches") is vacuously true
        // for an empty list, so an unreadable re-read would otherwise confirm a
        // removal that was never observed.
        mockRevoke.mockResolvedValue({ status: 'ok', changed: true });
        mockReadSiteAccess.mockResolvedValue({ status: 'failed', error: 'no role map' });

        const result = await removeSiteAdmin(project, 'gone@adobe.com', context, logger);

        expect(result.verified).toBe(false);
    });

    it('addSiteAdmin does NOT report verified when the re-read is unreadable', async () => {
        mockEnsure.mockResolvedValue({ status: 'ok', changed: true });
        mockReadSiteAccess.mockResolvedValue({ status: 'failed', error: 'no role map' });

        const result = await addSiteAdmin(project, 'new@adobe.com', context, logger);

        expect(result.verified).toBe(false);
    });
});

/**
 * `canManage` is an ALLOW-list over status, not `!== 'not_authorized'`.
 *
 * The deny-one form said "yes you can manage" for a signed-out user
 * (`no_credential`), reintroducing the contradiction the derivation was added to
 * remove. Without these, both the derivation and the allow-list would survive
 * being reverted (verify-loop iteration 2).
 */
describe('canManage never contradicts the status', () => {
    it('is false when a mutation is refused', async () => {
        mockEnsure.mockResolvedValue({ status: 'not_authorized' });

        const result = await addSiteAdmin(project, 'new@adobe.com', context, logger);

        expect(result.status).toBe('not_authorized');
        expect(result.canManage).toBe(false);
    });

    it('is false when there is no DA.live credential', async () => {
        mockEnsure.mockResolvedValue({ status: 'no_credential' });

        const result = await addSiteAdmin(project, 'new@adobe.com', context, logger);

        expect(result.canManage).toBe(false);
    });

    it('is false when a revoke is refused', async () => {
        mockRevoke.mockResolvedValue({ status: 'not_authorized' });

        const result = await removeSiteAdmin(project, 'gone@adobe.com', context, logger);

        expect(result.canManage).toBe(false);
    });

    it('listSiteAccess reports no_credential rather than a generic failure', async () => {
        // A signed-out user must be told to sign in, not to read the Debug Logs.
        const { createDaLiveServiceTokenProvider } = jest.requireMock(
            '@/features/eds/services/daLive/daLiveContentOperations',
        );
        createDaLiveServiceTokenProvider.mockReturnValueOnce({
            getAccessToken: jest.fn().mockResolvedValue(null),
        });

        const result = await listSiteAccess(project, context, logger);

        expect(result.status).toBe('no_credential');
        expect(result.canManage).toBe(false);
    });
});

/**
 * A project with no EDS storefront: every entry point must refuse the same way.
 *
 * The mutation run showed the two MUTATION entry points had no test at all on
 * this branch — deleting the guard, or flipping either flag in the object it
 * returns, changed nothing any test could see.
 */
describe('no EDS storefront', () => {
    const noRepo = createMockProject({
        name: 'x',
        path: '/tmp/x',
        selectedStack: 'eds-accs',
        componentInstances: {},
    });

    it('listSiteAccess reports no_site and cannot manage', async () => {
        const result = await listSiteAccess(noRepo, context, logger);

        expect(result.status).toBe('no_site');
        expect(result.canManage).toBe(false);
    });

    it('addSiteAdmin refuses before any write', async () => {
        const result = await addSiteAdmin(noRepo, 'new@adobe.com', context, logger);

        expect(result.status).toBe('no_site');
        expect(result.canManage).toBe(false);
        expect(result.verified).toBe(false);
        expect(mockEnsure).not.toHaveBeenCalled();
    });

    it('removeSiteAdmin refuses before any write', async () => {
        const result = await removeSiteAdmin(noRepo, 'gone@adobe.com', context, logger);

        expect(result.status).toBe('no_site');
        expect(result.canManage).toBe(false);
        expect(result.verified).toBe(false);
        expect(mockRevoke).not.toHaveBeenCalled();
    });
});

/**
 * The probe has three outcomes and they are NOT two.
 *
 * `refused` is a verdict about the role; `unauthenticated` is a verdict about
 * the session; `unknown` is neither. Reporting a 401 as `not_authorized` sends
 * someone to fix permissions that were never checked, which is the merge the
 * SiteAccessStatus docstring forbids.
 */
describe('listSiteAccess distinguishes the probe outcomes', () => {
    it('reports a 401 as failed WITH a sign-in error, not as not_authorized', async () => {
        mockProbe.mockResolvedValue('unauthenticated');

        const result = await listSiteAccess(project, context, logger);

        expect(result.status).toBe('failed');
        expect(result.error).toEqual(expect.stringContaining('401'));
    });

    it('reports an unknown probe result as failed with NO sign-in error', async () => {
        // The sign-in advice is only true for a 401. Attaching it to every
        // failure tells a user with a working session to sign in again.
        mockProbe.mockResolvedValue('unknown');

        const result = await listSiteAccess(project, context, logger);

        expect(result.status).toBe('failed');
        expect(result.error).toBeUndefined();
    });
});

/**
 * The org roster is reported only when its own read SUCCEEDED.
 *
 * The fakes here return an `admins` array alongside a non-ok status on purpose:
 * a check that keyed off the array instead of the status would pass with the
 * roster present, and would publish a roster the service never confirmed.
 */
describe('org admins are gated on the roster read status', () => {
    const staleRoster = { status: 'failed', admins: ['stale@adobe.com'] };

    it('are reported alongside a refusal so the user knows who to ask', async () => {
        mockProbe.mockResolvedValue('refused');

        const result = await listSiteAccess(project, context, logger);

        expect(result.orgAdmins).toEqual(['owner@adobe.com']);
    });

    it('are withheld alongside a refusal when the roster read failed', async () => {
        mockProbe.mockResolvedValue('refused');
        mockReadOrgAdmins.mockResolvedValue(staleRoster);

        const result = await listSiteAccess(project, context, logger);

        expect(result.orgAdmins).toBeUndefined();
    });

    it('are reported when the SITE read failed but the roster read did not', async () => {
        mockReadSiteAccess.mockResolvedValue({ status: 'failed', error: 'no role map' });

        const result = await listSiteAccess(project, context, logger);

        expect(result.orgAdmins).toEqual(['owner@adobe.com']);
    });

    it('are withheld when both reads failed', async () => {
        mockReadSiteAccess.mockResolvedValue({ status: 'failed', error: 'no role map' });
        mockReadOrgAdmins.mockResolvedValue(staleRoster);

        const result = await listSiteAccess(project, context, logger);

        expect(result.orgAdmins).toBeUndefined();
    });

    it('are withheld on the SUCCESS path too when the roster read failed', async () => {
        mockReadOrgAdmins.mockResolvedValue(staleRoster);

        const result = await listSiteAccess(project, context, logger);

        expect(result.status).toBe('ok');
        expect(result.orgAdmins).toBeUndefined();
    });
});

/**
 * A failed site read carries the reason it failed, and says which kind it was.
 */
describe('listSiteAccess reports why the site read failed', () => {
    it('passes the upstream reason through rather than a generic one', async () => {
        mockReadSiteAccess.mockResolvedValue({ status: 'failed', error: 'role map is a string' });

        const result = await listSiteAccess(project, context, logger);

        expect(result.error).toBe('role map is a string');
    });

    it('reports a refused site read as not_authorized, not as a generic failure', async () => {
        mockReadSiteAccess.mockResolvedValue({ status: 'not_authorized', error: '403' });

        const result = await listSiteAccess(project, context, logger);

        expect(result.status).toBe('not_authorized');
        expect(result.canManage).toBe(false);
    });

    it('reports an empty admin list when the read succeeded with no role map', async () => {
        // Distinct from the FAILED read above: this site really has no admins,
        // and `[]` is the honest answer. Reading `.admin` off an absent `roles`
        // would throw instead of answering.
        mockReadSiteAccess.mockResolvedValue({ status: 'ok' });

        const result = await listSiteAccess(project, context, logger);

        expect(result.status).toBe('ok');
        expect(result.siteAdmins).toEqual([]);
    });
});

/**
 * The email is validated whole and trimmed once, and the TRIMMED value is what
 * reaches the API and the verification predicate.
 */
describe('addSiteAdmin email handling', () => {
    it('rejects an address with trailing junk after the domain', async () => {
        const result = await addSiteAdmin(project, 'new@adobe.com and friends', context, logger);

        expect(result.status).toBe('invalid');
        expect(mockEnsure).not.toHaveBeenCalled();
    });

    it('rejects an address with leading junk before the local part', async () => {
        const result = await addSiteAdmin(project, 'mail to new@adobe.com', context, logger);

        expect(result.status).toBe('invalid');
        expect(mockEnsure).not.toHaveBeenCalled();
    });

    it('an invalid address is an INPUT verdict, not a permissions one', async () => {
        const result = await addSiteAdmin(project, 'not-an-email', context, logger);

        expect(result.canManage).toBe(true);
        expect(result.verified).toBe(false);
    });

    it('sends the trimmed address to the API and verifies against it', async () => {
        // Asserting the ARGUMENT: an untrimmed address writes a role keyed to a
        // string with spaces in it, which the re-read would never match.
        mockEnsure.mockResolvedValue({ status: 'ok', changed: true });
        mockReadSiteAccess.mockResolvedValue({
            status: 'ok',
            roles: { admin: ['new@adobe.com'] },
        });

        const result = await addSiteAdmin(project, '  new@adobe.com  ', context, logger);

        expect(mockEnsure).toHaveBeenCalledWith(
            expect.anything(),
            'skukla',
            'bodea-source',
            'new@adobe.com',
            logger,
        );
        expect(result.verified).toBe(true);
    });
});

/**
 * `canManage` on the two mutation paths.
 *
 * `invalid` is the one non-ok status that still means "you may manage this" —
 * the call never left because the input was malformed. Every other refusal
 * means no.
 */
describe('canManage on mutation results', () => {
    it('a rejected grant INPUT still reports the identity as able to manage', async () => {
        mockEnsure.mockResolvedValue({ status: 'invalid', error: 'not a known user' });

        const result = await addSiteAdmin(project, 'ghost@adobe.com', context, logger);

        expect(result.status).toBe('invalid');
        expect(result.canManage).toBe(true);
    });

    it('the last-admin refusal reports able-to-manage and NOT verified', async () => {
        mockRevoke.mockResolvedValue({ status: 'invalid', error: 'cannot remove the last admin' });

        const result = await removeSiteAdmin(project, 'only@adobe.com', context, logger);

        expect(result.canManage).toBe(true);
        expect(result.verified).toBe(false);
    });

    it('a confirmed grant reports able-to-manage', async () => {
        mockEnsure.mockResolvedValue({ status: 'ok', changed: true });
        mockReadSiteAccess.mockResolvedValue({
            status: 'ok',
            roles: { admin: ['new@adobe.com'] },
        });

        const result = await addSiteAdmin(project, 'new@adobe.com', context, logger);

        expect(result.canManage).toBe(true);
    });

    it('a confirmed revoke reports able-to-manage', async () => {
        mockRevoke.mockResolvedValue({ status: 'ok', changed: true });
        mockReadSiteAccess.mockResolvedValue({ status: 'ok', roles: { admin: ['a@adobe.com'] } });

        const result = await removeSiteAdmin(project, 'gone@adobe.com', context, logger);

        expect(result.canManage).toBe(true);
    });
});

/**
 * The revoke predicate is "NOBODY in the list matches", not "somebody doesn't".
 *
 * `some` in place of `every` confirms a removal whenever the site has any OTHER
 * admin left — which is almost always — so the one case that matters (the
 * address is still there) would report verified.
 */
describe('removeSiteAdmin verification predicate', () => {
    it('is NOT verified when the re-read still lists the address', async () => {
        mockRevoke.mockResolvedValue({ status: 'ok', changed: true });
        mockReadSiteAccess.mockResolvedValue({
            status: 'ok',
            roles: { admin: ['a@adobe.com', 'gone@adobe.com'] },
        });

        const result = await removeSiteAdmin(project, 'gone@adobe.com', context, logger);

        expect(result.verified).toBe(false);
        expect(result.siteAdmins).toEqual(['a@adobe.com', 'gone@adobe.com']);
    });

    it('compares the TRIMMED address against the re-read list', async () => {
        mockRevoke.mockResolvedValue({ status: 'ok', changed: true });
        mockReadSiteAccess.mockResolvedValue({
            status: 'ok',
            roles: { admin: ['gone@adobe.com'] },
        });

        const result = await removeSiteAdmin(project, '  gone@adobe.com  ', context, logger);

        expect(mockRevoke).toHaveBeenCalledWith(
            expect.anything(),
            'skukla',
            'bodea-source',
            'gone@adobe.com',
            logger,
        );
        expect(result.verified).toBe(false);
    });

    it('reports an empty list when the re-read succeeds with no role map', async () => {
        // Vacuously verified — nobody is listed, so the address is not listed.
        // Reading `.admin` off an absent `roles` would throw instead.
        mockRevoke.mockResolvedValue({ status: 'ok', changed: true });
        mockReadSiteAccess.mockResolvedValue({ status: 'ok' });

        const result = await removeSiteAdmin(project, 'gone@adobe.com', context, logger);

        expect(result.siteAdmins).toEqual([]);
        expect(result.verified).toBe(true);
    });
});
