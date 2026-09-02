/**
 * Shared harness for the `siteTools` suite family.
 *
 * THIS FILE OWNS THE MOCKS AND THE SUT IMPORT. `jest.mock` hoists above the imports of
 * the module it appears in, not across modules, so a spec importing the subject directly
 * could load it before these registered.
 *
 * Extracted 2026-09-02 when the single suite reached 880 lines against a 750-line CI
 * limit — a limit that had been failing on develop for two days before anyone looked,
 * because `npm run gate` does not run that check and the workflow is separate.
 *
 * MUTABLE STATE LIVES IN `world`. The scan fixtures used to be module-level `let`s that
 * tests reassigned; an imported binding cannot be reassigned from another module, so they
 * became fields on one object instead. Reassigning `world.allProjects` reads the same and
 * actually works across files.
 */

/**
 * (moved from the suite) Group 6's site tools — the storefront's Configuration Service admin list, the
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

export const mockListSiteAccess = jest.fn();
export const mockAddSiteAdmin = jest.fn();
export const mockRemoveSiteAdmin = jest.fn();
export const mockRepairSiteConfigForProject = jest.fn();

jest.mock('@/features/eds/services/configService/siteAccessManagerHeadless', () => ({
    listSiteAccess: (...a: unknown[]) => mockListSiteAccess(...a),
    addSiteAdmin: (...a: unknown[]) => mockAddSiteAdmin(...a),
    removeSiteAdmin: (...a: unknown[]) => mockRemoveSiteAdmin(...a),
}));

jest.mock('@/features/eds/services/configService/repairSiteConfigForProject', () => ({
    repairSiteConfigForProject: (...a: unknown[]) => mockRepairSiteConfigForProject(...a),
}));

export const mockFindStorefrontNameMismatch = jest.fn();
export const mockMigrateStorefrontNameForProject = jest.fn();

jest.mock('@/features/eds/services/storefront/storefrontNameMigrationForProject', () => ({
    findStorefrontNameMismatch: (...a: unknown[]) => mockFindStorefrontNameMismatch(...a),
    migrateStorefrontNameForProject: (...a: unknown[]) =>
        mockMigrateStorefrontNameForProject(...a),
}));

import { registerSiteTools } from '@/features/ai/server/siteTools';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import type { HandlerContext } from '@/types/handlers';
import { createMockLogger } from '../../../helpers/loggerFake';

type Tool = (args: unknown) => Promise<{ content: Array<{ text: string }> }>;

// `selectedStack` is load-bearing, not decoration: site configuration is an EDS
// concept (a Configuration Service entry keyed by the storefront's GitHub
// owner/repo), and these tools now refuse a project that is not one. The fixture
// previously carried only name+path, which describes a project with NO stack —
// a shape these tools were never meant to answer for.
export const project = { name: 'demo', path: '/projects/demo', selectedStack: 'eds-accs' };
/** A project these tools do not apply to. */
export const headlessProject = { name: 'headless', path: '/projects/headless', selectedStack: 'headless-accs' };
export const extensionContext = { secrets: {} };
export const logger = createMockLogger();

/** Per-test state the harness reads. Fields, not bindings — see the header. */
export const world: {
    /** Projects the scan walks. */
    allProjects: Array<{ name: string; path: string }>;
    /** What `loadProjectFromPath` resolves to, keyed by path. */
    projectsOnDisk: Record<string, unknown>;
} = { allProjects: [], projectsOnDisk: {} };
export const loadProjectFromPath = jest.fn(
    async (
        path: string,
        // The real signature, so a test can assert what it was HANDED. Narrower than
        // the real thing, the tuple has no second element and the compiler says so —
        // which is how the terminal provider below stopped being described as a
        // "component list" it never was.
        _terminalProvider?: () => readonly unknown[],
        _options?: { persistAfterLoad?: boolean }
    ) => world.projectsOnDisk[path]
);
export const saveProject = jest.fn().mockResolvedValue(undefined);

/**
 * Built with the current project passed explicitly rather than defaulted — a
 * default parameter treats an explicit `undefined` as "not supplied", so
 * `harnessWithNoProject()` would have quietly kept the project and the no-project
 * tests would have measured the happy path.
 */
/**
 * The parts of a tool's registration that describe it to an AGENT rather than run it.
 *
 * The harness used to drop the definition on the floor (`_def: never`), so the
 * annotations were unobservable and nothing could assert them — twelve mutants sat on
 * those booleans, each one flipping what Claude Code is told about whether a tool is
 * safe to call.
 */
export function buildHarness(currentProject: unknown) {
    const tools = new Map<string, Tool>();
    const defs = new Map<string, McpToolSchema>();
    const server = {
        registerTool(name: string, def: McpToolSchema, handler: Tool) {
            tools.set(name, handler);
            defs.set(name, def);
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
                    getAllProjects: async () => world.allProjects,
                    loadProjectFromPath,
                    saveProject,
                },
            }) as unknown as HandlerContext,
    );
    return {
        names: () => [...tools.keys()],
        /** What `tools/list` hands the agent for this tool. */
        definitionOf: (name: string): McpToolSchema => defs.get(name)!,
        async callRaw(name: string, args: Record<string, unknown> = {}): Promise<string> {
            return (await tools.get(name)!(args)).content[0].text;
        },
        async call(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
            const out = await tools.get(name)!(args);
            return JSON.parse(out.content[0].text);
        },
    };
}

export const harness = () => buildHarness(project);
/** `getCurrentProject()` resolves undefined when no project is open. */
export const harnessWithNoProject = () => buildHarness(undefined);


export const candidate = {
    project,
    projectName: 'demo',
    projectPath: '/projects/demo',
    repoOwner: 'someone',
    repoName: 'demo-builder-test',
    daLiveOrg: 'someone',
    daLiveSite: 'citisignal-one',
};


export function resetSiteToolsMocks(): void {
    jest.clearAllMocks();
    mockListSiteAccess.mockResolvedValue({ status: 'ok', site: 'acme/store', canManage: true });
    mockAddSiteAdmin.mockResolvedValue({ status: 'ok', verified: true, canManage: true });
    mockRemoveSiteAdmin.mockResolvedValue({ status: 'ok', verified: true, canManage: true });
    mockRepairSiteConfigForProject.mockResolvedValue({ status: 'repaired', verified: true });
    world.allProjects = [];
    world.projectsOnDisk = {};
    // Restored explicitly: `clearAllMocks` clears recorded calls but NOT an
    // implementation set with `mockImplementation`, so the throwing one below
    // would leak into every test after it.
    loadProjectFromPath.mockImplementation(async (path: string) => world.projectsOnDisk[path]);
    mockFindStorefrontNameMismatch.mockReturnValue(null);
    mockMigrateStorefrontNameForProject.mockResolvedValue({
        skipped: false,
        migrated: true,
        publishKeyRenewed: true,
    });
}
