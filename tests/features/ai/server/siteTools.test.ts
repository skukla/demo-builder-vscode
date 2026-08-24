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

jest.mock('@/features/eds/services/configService/siteAccessManagerHeadless', () => ({
    listSiteAccess: (...a: unknown[]) => mockListSiteAccess(...a),
    addSiteAdmin: (...a: unknown[]) => mockAddSiteAdmin(...a),
    removeSiteAdmin: (...a: unknown[]) => mockRemoveSiteAdmin(...a),
}));

jest.mock('@/features/eds/services/configService/repairSiteConfigForProject', () => ({
    repairSiteConfigForProject: (...a: unknown[]) => mockRepairSiteConfigForProject(...a),
}));

const mockFindStorefrontNameMismatch = jest.fn();
const mockMigrateStorefrontNameForProject = jest.fn();

jest.mock('@/features/eds/services/storefront/storefrontNameMigrationForProject', () => ({
    findStorefrontNameMismatch: (...a: unknown[]) => mockFindStorefrontNameMismatch(...a),
    migrateStorefrontNameForProject: (...a: unknown[]) =>
        mockMigrateStorefrontNameForProject(...a),
}));

import { expectWithinCeiling } from './responseCeilings';
import { registerSiteTools } from '@/features/ai/server/siteTools';
import type { HandlerContext } from '@/types/handlers';

type Tool = (args: unknown) => Promise<{ content: Array<{ text: string }> }>;

// `selectedStack` is load-bearing, not decoration: site configuration is an EDS
// concept (a Configuration Service entry keyed by the storefront's GitHub
// owner/repo), and these tools now refuse a project that is not one. The fixture
// previously carried only name+path, which describes a project with NO stack —
// a shape these tools were never meant to answer for.
const project = { name: 'demo', path: '/projects/demo', selectedStack: 'eds-accs' };
/** A project these tools do not apply to. */
const headlessProject = { name: 'headless', path: '/projects/headless', selectedStack: 'headless-accs' };
const extensionContext = { secrets: {} };
const logger = { warn: jest.fn() };

/** Projects the scan walks. Overwritten per test. */
let allProjects: Array<{ name: string; path: string }> = [];
/** What `loadProjectFromPath` resolves to, keyed by path. */
let projectsOnDisk: Record<string, unknown> = {};
const loadProjectFromPath = jest.fn(async (path: string) => projectsOnDisk[path]);
const saveProject = jest.fn().mockResolvedValue(undefined);

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
                stateManager: {
                    getCurrentProject: async () => currentProject,
                    getAllProjects: async () => allProjects,
                    loadProjectFromPath,
                    saveProject,
                },
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
    allProjects = [];
    projectsOnDisk = {};
    // Restored explicitly: `clearAllMocks` clears recorded calls but NOT an
    // implementation set with `mockImplementation`, so the throwing one below
    // would leak into every test after it.
    loadProjectFromPath.mockImplementation(async (path: string) => projectsOnDisk[path]);
    mockFindStorefrontNameMismatch.mockReturnValue(null);
    mockMigrateStorefrontNameForProject.mockResolvedValue({
        skipped: false,
        migrated: true,
        publishKeyRenewed: true,
    });
});

it('registers the six Group 6 tools', () => {
    expect(harness().names().sort()).toEqual([
        'connect_dalive',
        'find_storefront_name_mismatches',
        'get_site_access',
        'migrate_storefront_name',
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

/** A candidate as `findStorefrontNameMismatch` returns it. */
const candidate = {
    project,
    projectName: 'demo',
    projectPath: '/projects/demo',
    repoOwner: 'someone',
    repoName: 'demo-builder-test',
    daLiveOrg: 'someone',
    daLiveSite: 'citisignal-one',
};

describe('project shape', () => {
    // These tools answer questions about a Configuration Service site entry,
    // which only EDS storefront projects have. `storefrontTools` already refused
    // a non-EDS project ("republish applies only to EDS storefront projects");
    // these did not, so `repair_site_configuration` on a headless project passed
    // its confirm gate and called straight into the repair path with nothing to
    // repair. Found by a sweep 2026-08-24, after the same class shipped in the
    // demo lifecycle tools.
    const headless = () => buildHarness(headlessProject);

    it.each([
        ['get_site_access', {}],
        ['set_site_admin', { email: 'a@b.com', admin: true, confirm: true }],
        ['repair_site_configuration', { confirm: true }],
    ])('refuses %s on a project that is not an EDS storefront', async (tool, args) => {
        const out = await headless().call(tool, args);

        expect(String(out.error)).toContain('applies only to EDS storefront projects');
    });

    it('still answers for an EDS project', async () => {
        // The guard must not cost the tools their actual job.
        mockListSiteAccess.mockResolvedValue({ admins: [] });

        const out = await harness().call('get_site_access', {});

        expect(out.error).toBeUndefined();
    });
});

describe('find_storefront_name_mismatches', () => {
    it('reports each mismatched project with where it moves from and to', async () => {
        allProjects = [{ name: 'demo', path: '/projects/demo' }];
        projectsOnDisk = { '/projects/demo': project };
        mockFindStorefrontNameMismatch.mockReturnValue(candidate);

        const out = await harness().call('find_storefront_name_mismatches');

        expect(out).toEqual({
            scanned: 1,
            total: 1,
            mismatches: [
                {
                    project: 'demo',
                    projectPath: '/projects/demo',
                    from: 'someone/citisignal-one',
                    to: 'someone/demo-builder-test',
                },
            ],
        });
    });

    it('does not rewrite the manifests it inspects', async () => {
        allProjects = [{ name: 'demo', path: '/projects/demo' }];
        projectsOnDisk = { '/projects/demo': project };

        await harness().call('find_storefront_name_mismatches');

        // A scan that persisted every project it read would be a write hiding
        // in a read.
        expect(loadProjectFromPath).toHaveBeenCalledWith('/projects/demo', expect.any(Function), {
            persistAfterLoad: false,
        });
        expect(saveProject).not.toHaveBeenCalled();
    });

    it('reports an empty list rather than an error when nothing needs migrating', async () => {
        allProjects = [{ name: 'demo', path: '/projects/demo' }];
        projectsOnDisk = { '/projects/demo': project };

        const out = await harness().call('find_storefront_name_mismatches');

        expect(out).toEqual({ scanned: 1, total: 0, mismatches: [] });
    });

    it('one unreadable project does not hide the others', async () => {
        allProjects = [
            { name: 'broken', path: '/projects/broken' },
            { name: 'demo', path: '/projects/demo' },
        ];
        projectsOnDisk = { '/projects/demo': project };
        loadProjectFromPath.mockImplementation(async (path: string) => {
            if (path === '/projects/broken') throw new Error('unreadable manifest');
            return projectsOnDisk[path];
        });
        mockFindStorefrontNameMismatch.mockReturnValue(candidate);

        const out = await harness().call('find_storefront_name_mismatches');

        expect(out.total).toBe(1);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('broken'));
    });

    it('pages the list rather than trusting it to stay small', async () => {
        allProjects = Array.from({ length: 25 }, (_, i) => ({
            name: `p${i}`,
            path: `/projects/p${i}`,
        }));
        projectsOnDisk = Object.fromEntries(allProjects.map((p) => [p.path, project]));
        mockFindStorefrontNameMismatch.mockReturnValue(candidate);

        const out = await harness().call('find_storefront_name_mismatches');

        expect(out.total).toBe(25);
        expect(out.mismatches).toHaveLength(20);
    });
});

describe('migrate_storefront_name', () => {
    const atDemo = { projectPath: '/projects/demo' };

    beforeEach(() => {
        projectsOnDisk = { '/projects/demo': project };
        mockFindStorefrontNameMismatch.mockReturnValue(candidate);
    });

    it('refuses without confirm and echoes what it would delete', async () => {
        const out = await harness().call('migrate_storefront_name', atDemo);

        expect(String(out.error)).toMatch(/confirmName:"demo"/);
        expect(out.irreversible).toBe(true);
        expect(out.from).toBe('someone/citisignal-one');
        expect(mockMigrateStorefrontNameForProject).not.toHaveBeenCalled();
    });

    it('refuses when the name echo does not match', async () => {
        const out = await harness().call('migrate_storefront_name', {
            ...atDemo,
            confirm: true,
            confirmName: 'not-the-project',
        });

        expect(out.irreversible).toBe(true);
        expect(mockMigrateStorefrontNameForProject).not.toHaveBeenCalled();
    });

    it('migrates when confirm and the echo both match', async () => {
        const out = await harness().call('migrate_storefront_name', {
            ...atDemo,
            confirm: true,
            confirmName: 'demo',
        });

        expect(mockMigrateStorefrontNameForProject).toHaveBeenCalledWith(
            candidate,
            extensionContext,
            logger,
            expect.any(Function),
        );
        expect(out.migrated).toBe(true);
        expect(out.publishKeyRenewed).toBe(true);
        expect(out.to).toBe('someone/demo-builder-test');
    });

    it('reports a publish key that was NOT re-minted', async () => {
        mockMigrateStorefrontNameForProject.mockResolvedValue({
            skipped: false,
            migrated: false,
            error: 'DA content copy failed',
            publishKeyRenewed: false,
        });

        const out = await harness().call('migrate_storefront_name', {
            ...atDemo,
            confirm: true,
            confirmName: 'demo',
        });

        // A migrated storefront whose key was not re-minted cannot publish, and
        // nothing surfaces that until someone tries.
        expect(out.publishKeyRenewed).toBe(false);
        expect(out.error).toBe('DA content copy failed');
    });

    it('carries lostGrants through', async () => {
        mockMigrateStorefrontNameForProject.mockResolvedValue({
            skipped: false,
            migrated: true,
            publishKeyRenewed: true,
            lostGrants: ['o***r@example.test'],
        });

        const out = await harness().call('migrate_storefront_name', {
            ...atDemo,
            confirm: true,
            confirmName: 'demo',
        });

        expect(out.lostGrants).toEqual(['o***r@example.test']);
    });

    it('says "nothing to do" rather than erroring on an already-correct project', async () => {
        mockFindStorefrontNameMismatch.mockReturnValue(null);

        const out = await harness().call('migrate_storefront_name', {
            ...atDemo,
            confirm: true,
            confirmName: 'demo',
        });

        // Not an error: an agent looping the mismatch list must be able to tell
        // a no-op from a failure.
        expect(out.migrated).toBe(false);
        expect(out.error).toBeUndefined();
        expect(String(out.reason)).toMatch(/no storefront-name mismatch/);
    });

    it('refuses a projectPath that resolves to nothing', async () => {
        const out = await harness().call('migrate_storefront_name', {
            projectPath: '/projects/gone',
            confirm: true,
            confirmName: 'demo',
        });

        expect(String(out.error)).toMatch(/No project found/);
        expect(mockMigrateStorefrontNameForProject).not.toHaveBeenCalled();
    });

    it('requires a projectPath', async () => {
        const out = await harness().call('migrate_storefront_name', { confirm: true });

        expect(String(out.error)).toMatch(/projectPath is required/);
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

    it('find_storefront_name_mismatches stays under its ceiling at a FULL page', async () => {
        // The live measurement was 0 mismatches across 2 projects — 39 bytes,
        // which proves nothing about the bound. This drives a full page of the
        // widest realistic row instead.
        allProjects = Array.from({ length: 25 }, (_, i) => ({
            name: `project-${i}`,
            path: `/Users/someone/.demo-builder/projects/a-fairly-long-project-name-${i}`,
        }));
        projectsOnDisk = Object.fromEntries(allProjects.map((p) => [p.path, project]));
        mockFindStorefrontNameMismatch.mockImplementation((p: { path: string }) => ({
            ...candidate,
            projectName: 'a-fairly-long-project-name',
            projectPath: p.path,
        }));

        const raw = await harness().callRaw('find_storefront_name_mismatches');
        expectWithinCeiling('find_storefront_name_mismatches', raw);
    });

    it('migrate_storefront_name stays under its ceiling on the SUCCESS branch', async () => {
        // The branch the live probe could NOT reach: no project with a name
        // mismatch exists to run it against.
        projectsOnDisk = { '/projects/demo': project };
        mockFindStorefrontNameMismatch.mockReturnValue(candidate);
        mockMigrateStorefrontNameForProject.mockResolvedValue({
            skipped: false,
            migrated: true,
            publishKeyRenewed: true,
            lostGrants: ['f***t@example.test', 's***d@example.test'],
        });

        const raw = await harness().callRaw('migrate_storefront_name', {
            projectPath: '/projects/demo',
            confirm: true,
            confirmName: 'demo',
        });
        expectWithinCeiling('migrate_storefront_name', raw);
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
