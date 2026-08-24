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

jest.mock('@/features/eds/services/configServiceAccess', () => ({
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
} from '@/features/eds/services/siteAccessManagerHeadless';
import {
    ensureSiteAdmin,
    probeConfigWriteAccess,
    readOrgAdmins,
    readSiteAccess,
    revokeSiteAdmin,
} from '@/features/eds/services/configServiceAccess';
import type { Project } from '@/types/base';

const mockReadSiteAccess = readSiteAccess as jest.Mock;
const mockReadOrgAdmins = readOrgAdmins as jest.Mock;
const mockEnsure = ensureSiteAdmin as jest.Mock;
const mockRevoke = revokeSiteAdmin as jest.Mock;
const mockProbe = probeConfigWriteAccess as jest.Mock;

const logger = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

const context = {} as never;

/**
 * An EDS project whose storefront points at skukla/bodea-source.
 *
 * Shape copied from what `getEdsGithubRepo` actually reads — `selectedStack`
 * must be an EDS stack (isEdsProject gates on it) and the repo lives on
 * `componentInstances['eds-storefront'].metadata.githubRepo`. An invented shape
 * here resolves to "no site" and every assertion fails for the wrong reason.
 */
const project = {
    name: 'bodea',
    path: '/tmp/bodea',
    selectedStack: 'eds-accs',
    componentInstances: {
        'eds-storefront': { metadata: { githubRepo: 'skukla/bodea-source' } },
    },
} as unknown as Project;

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
        const noRepo = {
            name: 'x',
            path: '/tmp/x',
            selectedStack: 'eds-accs',
            componentInstances: {},
        } as unknown as Project;

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
