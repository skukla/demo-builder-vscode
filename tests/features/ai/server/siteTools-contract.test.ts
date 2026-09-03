/**
 * What the site tools tell an AGENT about themselves, and how big their answers are.
 *
 * Both halves are contract rather than behaviour: the annotations travel to the client in
 * `tools/list` and decide what Claude Code may call unprompted, and the response ceilings
 * decide whether an answer fits in a context window. Neither is about what a tool DOES,
 * which is `siteTools.test.ts`.
 *
 * Split out 2026-09-02 when the single suite hit 880 lines against a 750-line limit.
 */

import { expectWithinCeiling } from './responseCeilings';
import {
    candidate,
    harness,
    project,
    resetSiteToolsMocks,
    world,
    mockListSiteAccess,
    mockAddSiteAdmin,
    mockRemoveSiteAdmin,
    mockRepairSiteConfigForProject,
    mockFindStorefrontNameMismatch,
    mockMigrateStorefrontNameForProject,
} from './siteTools.testUtils';

beforeEach(() => {
    resetSiteToolsMocks();
});

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
        world.allProjects = Array.from({ length: 25 }, (_, i) => ({
            name: `project-${i}`,
            path: `/Users/someone/.demo-builder/projects/a-fairly-long-project-name-${i}`,
        }));
        world.projectsOnDisk = Object.fromEntries(world.allProjects.map((p) => [p.path, project]));
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
        world.projectsOnDisk = { '/projects/demo': project };
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

/**
 * WHAT THESE TOOLS TELL AN AGENT ABOUT THEMSELVES.
 *
 * `annotations` is not decoration. It travels to the client in `tools/list`, so it is
 * how Claude Code learns which of these tools are safe to call unprompted, and the dry
 * run gates on `readOnlyHint`. Twelve mutants sat on these six booleans and every one
 * survived: nothing asserted them, because the test harness discarded the definition
 * and kept only the handler.
 *
 * Flipping one is not a test failure anywhere else in this suite — it is an agent being
 * told that a tool which rewrites a project manifest is read-only.
 */
describe('what these tools declare themselves to be', () => {
    /** Tool -> [readOnlyHint, destructiveHint]. */
    const DECLARED: [string, boolean, boolean][] = [
        ['get_site_access', true, false],
        ['find_storefront_name_mismatches', true, false],
        ['set_site_admin', false, true],
        ['migrate_storefront_name', false, true],
        ['repair_site_configuration', false, false],
        ['connect_dalive', false, false],
    ];

    it.each(DECLARED)('%s declares readOnly=%s destructive=%s', (name, readOnly, destructive) => {
        expect(harness().definitionOf(name).annotations).toEqual({
            readOnlyHint: readOnly,
            destructiveHint: destructive,
        });
    });

    it('covers every registered tool, so a new one cannot arrive unpinned', () => {
        expect(DECLARED.map(([n]) => n).sort()).toEqual(harness().names().sort());
    });

    /**
     * The pins above restate the source. These two tie the declaration to what the tool
     * actually DOES, which is the part an agent is trusting.
     */
    /**
     * Arguments that reach each destructive tool's gate. They must be VALID apart from
     * the missing confirmation: `migrate_storefront_name` resolves its target before
     * gating, so a bogus path fails earlier and the test would pass on the wrong
     * refusal.
     */
    const ARGS_REACHING_THE_GATE: Record<string, Record<string, unknown>> = {
        set_site_admin: { email: 'someone@example.test', admin: true },
        migrate_storefront_name: { projectPath: '/projects/demo' },
    };

    beforeEach(() => {
        // `migrate_storefront_name` resolves the project from disk before it gates, so
        // that path has to resolve or the refusal under test never runs.
        world.projectsOnDisk = { '/projects/demo': project };
        mockFindStorefrontNameMismatch.mockReturnValue(candidate);
    });

    it('every tool calling itself destructive really does refuse without confirm', async () => {
        const destructive = DECLARED.filter(([, , d]) => d).map(([n]) => n);
        expect(destructive.sort()).toEqual(Object.keys(ARGS_REACHING_THE_GATE).sort());

        for (const name of destructive) {
            const out = await harness().call(name, ARGS_REACHING_THE_GATE[name]);

            // Refused for the RIGHT reason, and nothing was written.
            expect(String(out.error)).toMatch(/confirm/i);
        }
        expect(mockAddSiteAdmin).not.toHaveBeenCalled();
        expect(mockRemoveSiteAdmin).not.toHaveBeenCalled();
        expect(mockMigrateStorefrontNameForProject).not.toHaveBeenCalled();
    });

    it('no tool calling itself read-only asks for a confirmation it would not honour', () => {
        const readOnly = DECLARED.filter(([, r]) => r).map(([n]) => n);
        expect(readOnly.length).toBeGreaterThan(0);

        for (const name of readOnly) {
            const schema = harness().definitionOf(name).inputSchema ?? {};
            expect(Object.keys(schema)).not.toContain('confirm');
        }
    });
});
