/**
 * Group 6's site tools — the storefront's Configuration Service admin list, the
 * repair for a refused registration, and the DA.live handoff.
 *
 * What is pinned here, and why each would otherwise fail silently:
 *
 * - Both writes REFUSE BEFORE DOING ANYTHING without `confirm:true`. Asserted by
 *   checking the service was never called, not just that an error came back — a
 *   gate that refuses after the write is not a gate.
 * - `repair_site_configuration` does NOT republish, and says `republish` is what
 *   remains. Registration writes a routing rule; an agent that stopped at
 *   `repaired` would report a storefront fixed that still serves the old config.
 * - `set_site_admin` routes on `admin`, and the two directions are different
 *   services. Crossed, a grant would revoke.
 * - `connect_dalive` never dispatches. It is a handoff by construction, because
 *   the credential arrives by bookmarklet and paste.
 */

const mockListSiteAccess = jest.fn();
const mockAddSiteAdmin = jest.fn();
const mockRemoveSiteAdmin = jest.fn();
const mockRepairSiteConfigForProject = jest.fn();

jest.mock('@/features/eds/services/siteAccessManagerHeadless', () => ({
    listSiteAccess: (...a: unknown[]) => mockListSiteAccess(...a),
    addSiteAdmin: (...a: unknown[]) => mockAddSiteAdmin(...a),
    removeSiteAdmin: (...a: unknown[]) => mockRemoveSiteAdmin(...a),
}));

jest.mock('@/features/eds/services/repairSiteConfigForProject', () => ({
    repairSiteConfigForProject: (...a: unknown[]) => mockRepairSiteConfigForProject(...a),
}));

import { expectWithinCeiling } from './responseCeilings';
import { registerSiteTools } from '@/features/ai/server/siteTools';
import type { HandlerContext } from '@/types/handlers';

type Tool = (args: unknown) => Promise<{ content: Array<{ text: string }> }>;

const project = { name: 'demo' };
const extensionContext = { secrets: {} };
const logger = { warn: jest.fn() };

/**
 * Built with the current project passed explicitly rather than defaulted — a
 * default parameter treats an explicit `undefined` as "not supplied", so
 * `harnessWithNoProject()` would have quietly kept the project and the no-project
 * tests would have measured the happy path.
 */
function buildHarness(currentProject: unknown) {
    const tools = new Map<string, Tool>();
    const server = {
        registerTool(name: string, _def: never, handler: Tool) {
            tools.set(name, handler);
        },
    };
    registerSiteTools(
        server,
        () =>
            ({
                context: extensionContext,
                logger,
                stateManager: { getCurrentProject: async () => currentProject },
            }) as unknown as HandlerContext,
    );
    return {
        names: () => [...tools.keys()],
        async callRaw(name: string, args: Record<string, unknown> = {}): Promise<string> {
            return (await tools.get(name)!(args)).content[0].text;
        },
        async call(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
            const out = await tools.get(name)!(args);
            return JSON.parse(out.content[0].text);
        },
    };
}

const harness = () => buildHarness(project);
/** `getCurrentProject()` resolves undefined when no project is open. */
const harnessWithNoProject = () => buildHarness(undefined);

beforeEach(() => {
    jest.clearAllMocks();
    mockListSiteAccess.mockResolvedValue({ status: 'ok', site: 'acme/store', canManage: true });
    mockAddSiteAdmin.mockResolvedValue({ status: 'ok', verified: true, canManage: true });
    mockRemoveSiteAdmin.mockResolvedValue({ status: 'ok', verified: true, canManage: true });
    mockRepairSiteConfigForProject.mockResolvedValue({ status: 'repaired', verified: true });
});

it('registers the four Group 6 tools', () => {
    expect(harness().names().sort()).toEqual([
        'connect_dalive',
        'get_site_access',
        'repair_site_configuration',
        'set_site_admin',
    ]);
});

describe('get_site_access', () => {
    it('returns the listing for the current project', async () => {
        const out = await harness().call('get_site_access');

        expect(out).toEqual({ status: 'ok', site: 'acme/store', canManage: true });
        expect(mockListSiteAccess).toHaveBeenCalledWith(project, extensionContext, logger);
    });

    it('reports the real admin addresses rather than masking them', async () => {
        mockListSiteAccess.mockResolvedValue({
            status: 'ok',
            site: 'acme/store',
            siteAdmins: ['owner@example.test'],
            canManage: false,
        });

        const out = await harness().call('get_site_access');

        // The point of the tool is naming who can grant the role. A masked
        // address can neither be relayed nor passed to set_site_admin.
        expect(out.siteAdmins).toEqual(['owner@example.test']);
    });

    it('refuses with no current project', async () => {
        const out = await harnessWithNoProject().call('get_site_access');

        expect(String(out.error)).toMatch(/No current project/);
        expect(mockListSiteAccess).not.toHaveBeenCalled();
    });
});

describe('set_site_admin', () => {
    it('refuses without confirm:true and changes nothing', async () => {
        const out = await harness().call('set_site_admin', {
            email: 'someone@example.test',
            admin: true,
        });

        expect(String(out.error)).toMatch(/confirm:true/);
        expect(mockAddSiteAdmin).not.toHaveBeenCalled();
        expect(mockRemoveSiteAdmin).not.toHaveBeenCalled();
    });

    it('grants when admin is true', async () => {
        await harness().call('set_site_admin', {
            email: 'someone@example.test',
            admin: true,
            confirm: true,
        });

        expect(mockAddSiteAdmin).toHaveBeenCalledWith(
            project,
            'someone@example.test',
            extensionContext,
            logger,
        );
        expect(mockRemoveSiteAdmin).not.toHaveBeenCalled();
    });

    it('revokes when admin is false', async () => {
        await harness().call('set_site_admin', {
            email: 'someone@example.test',
            admin: false,
            confirm: true,
        });

        expect(mockRemoveSiteAdmin).toHaveBeenCalledWith(
            project,
            'someone@example.test',
            extensionContext,
            logger,
        );
        expect(mockAddSiteAdmin).not.toHaveBeenCalled();
    });

    it('passes the mutation result through, verified flag and all', async () => {
        mockAddSiteAdmin.mockResolvedValue({
            status: 'ok',
            site: 'acme/store',
            siteAdmins: ['owner@example.test', 'someone@example.test'],
            canManage: true,
            verified: false,
        });

        const out = await harness().call('set_site_admin', {
            email: 'someone@example.test',
            admin: true,
            confirm: true,
        });

        // `verified: false` on an `ok` status is the case that matters: the write
        // returned 2xx and the re-read did not find the grant.
        expect(out.verified).toBe(false);
        expect(out.siteAdmins).toHaveLength(2);
    });

    it('refuses with no current project', async () => {
        const out = await harnessWithNoProject().call('set_site_admin', {
            email: 'someone@example.test',
            admin: true,
            confirm: true,
        });

        expect(String(out.error)).toMatch(/No current project/);
        expect(mockAddSiteAdmin).not.toHaveBeenCalled();
    });
});

describe('repair_site_configuration', () => {
    it('refuses without confirm:true and writes nothing', async () => {
        const out = await harness().call('repair_site_configuration', {});

        expect(String(out.error)).toMatch(/confirm:true/);
        expect(mockRepairSiteConfigForProject).not.toHaveBeenCalled();
    });

    it('names republish as what remains after a successful repair', async () => {
        const out = await harness().call('repair_site_configuration', { confirm: true });

        expect(out.status).toBe('repaired');
        expect(out.nextStep).toBe('republish');
    });

    it('does not claim a next step when the repair did not land', async () => {
        mockRepairSiteConfigForProject.mockResolvedValue({
            status: 'not_authorized',
            verified: false,
            site: 'acme/store',
            setupUrl: 'https://example.test/setup',
        });

        const out = await harness().call('repair_site_configuration', { confirm: true });

        expect(out.nextStep).toBeUndefined();
        expect(out.setupUrl).toBe('https://example.test/setup');
    });

    it('carries lostGrants through — nothing in the app can restore them', async () => {
        mockRepairSiteConfigForProject.mockResolvedValue({
            status: 'repaired',
            verified: true,
            lostGrants: ['o***r@example.test'],
        });

        const out = await harness().call('repair_site_configuration', { confirm: true });

        expect(out.lostGrants).toEqual(['o***r@example.test']);
    });

    it('does not republish', async () => {
        const out = await harness().call('repair_site_configuration', { confirm: true });

        // The separation is repairSiteConfigHeadless's own: publishing here would
        // push a config change under whoever is presenting the demo.
        expect(out.cdnPublished).toBeUndefined();
        expect(out.githubPushed).toBeUndefined();
    });

    it('refuses with no current project', async () => {
        const out = await harnessWithNoProject().call('repair_site_configuration', { confirm: true });

        expect(String(out.error)).toMatch(/No current project/);
        expect(mockRepairSiteConfigForProject).not.toHaveBeenCalled();
    });
});

/**
 * The response-size guard, driven with shapes COPIED from the live probe
 * (2026-08-17, a real Configuration Service) rather than invented — addresses
 * and the Runtime overlay host redacted, lengths kept representative.
 *
 * A fixture composed from what the writing side produces is the mistake behind
 * two of the three bugs `mcp-live-probe` was written for. Do not "simplify"
 * these back to `{status:'ok'}`; the roster and the overlay URL are what the
 * ceilings are actually about.
 */
describe('response ceilings', () => {
    it('get_site_access stays under its ceiling with both rosters populated', async () => {
        mockListSiteAccess.mockResolvedValue({
            status: 'ok',
            site: 'someone/demo-builder-test',
            siteAdmins: ['first.admin@example.test'],
            orgAdmins: ['first.admin@example.test'],
            canManage: true,
        });

        expectWithinCeiling('get_site_access', await harness().callRaw('get_site_access'));
    });

    it('set_site_admin stays under its ceiling', async () => {
        mockAddSiteAdmin.mockResolvedValue({
            status: 'ok',
            site: 'someone/demo-builder-test',
            siteAdmins: ['first.admin@example.test', 'mcp-probe@example.test'],
            canManage: true,
            verified: true,
        });

        const raw = await harness().callRaw('set_site_admin', {
            email: 'mcp-probe@example.test',
            admin: true,
            confirm: true,
        });
        expectWithinCeiling('set_site_admin', raw);
    });

    it('repair_site_configuration stays under its ceiling, overlay URL and all', async () => {
        mockRepairSiteConfigForProject.mockResolvedValue({
            status: 'repaired',
            verified: true,
            org: 'someone',
            site: 'demo-builder-test',
            // Length matters more than the value: the overlay URL was most of
            // the 241 bytes measured live.
            overlayUrl:
                'https://000000-exampleworkspace-stage.adobeioruntime.net/api/v1/web/' +
                'accs-discovery/render-pdp?org=someone&site=demo-builder-test',
        });

        const raw = await harness().callRaw('repair_site_configuration', { confirm: true });
        expectWithinCeiling('repair_site_configuration', raw);
    });

    it('connect_dalive stays under its ceiling', async () => {
        expectWithinCeiling('connect_dalive', await harness().callRaw('connect_dalive'));
    });
});

describe('connect_dalive', () => {
    it('always hands back, pointing at the bookmarklet setup command', async () => {
        const out = (await harness().call('connect_dalive')) as {
            needsUser: { reason: string; where: { command: string }; resumeWith: string };
        };

        expect(out.needsUser.reason).toBe('secret-entry');
        expect(out.needsUser.where.command).toBe('demoBuilder.openDaLiveBookmarkletSetup');
        expect(out.needsUser.resumeWith).toBe('get_auth_status');
    });

    it('hands back even with no current project — signing in does not need one', async () => {
        const out = (await harnessWithNoProject().call('connect_dalive')) as {
            needsUser?: unknown;
        };

        expect(out.needsUser).toBeDefined();
    });
});
