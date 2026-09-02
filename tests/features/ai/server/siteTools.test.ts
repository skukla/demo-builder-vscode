/**
 * Group 6's site tools — what each one DOES.
 *
 * The shared harness, mocks and fixtures live in `siteTools.testUtils.ts`; what these
 * tools declare about themselves, and how big their answers are, live in
 * `siteTools-contract.test.ts`. Split 2026-09-02 at the 750-line CI limit.
 *
 * What is pinned here, and why each would otherwise fail silently:
 *
 * - Both writes REFUSE BEFORE DOING ANYTHING without `confirm:true`. Asserted by
 *   checking the service was never called, not just that an error came back — a
 *   gate that refuses after the write is not a gate.
 * - `repair_site_configuration` does NOT republish, and says `republish` is what
 *   remains. An agent that stopped at `repaired` would report a storefront fixed
 *   that still serves the old config.
 * - `set_site_admin` routes on `admin`, and the two directions are different
 *   services. Crossed, a grant would revoke.
 * - `connect_dalive` never dispatches. It is a handoff by construction.
 */

import {
    buildHarness,
    candidate,
    harness,
    harnessWithNoProject,
    headlessProject,
    extensionContext,
    logger,
    loadProjectFromPath,
    saveProject,
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

    it('hands the repair a way to persist the project it changed', async () => {
        await harness().call('repair_site_configuration', { confirm: true });

        // The repair updates the project as it goes and cannot save it itself. If the
        // callback it is handed does nothing, the repair appears to succeed and the
        // change is gone at the next reload.
        const persist = mockRepairSiteConfigForProject.mock.calls[0][3] as (p: unknown) => unknown;
        persist(project);
        expect(saveProject).toHaveBeenCalledWith(project);
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
        world.allProjects = [{ name: 'demo', path: '/projects/demo' }];
        world.projectsOnDisk = { '/projects/demo': project };
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
        world.allProjects = [{ name: 'demo', path: '/projects/demo' }];
        world.projectsOnDisk = { '/projects/demo': project };

        await harness().call('find_storefront_name_mismatches');

        // A scan that persisted every project it read would be a write hiding
        // in a read.
        expect(loadProjectFromPath).toHaveBeenCalledWith('/projects/demo', expect.any(Function), {
            persistAfterLoad: false,
        });
        expect(saveProject).not.toHaveBeenCalled();

        // `expect.any(Function)` passes for ANY function, so it does not check what the
        // second argument ANSWERS. It is the loader's terminal provider, and a headless
        // MCP tool has no VS Code terminals to hand back — its default reaches for
        // `vscode.window.terminals`, which does not exist here.
        const [, terminals] = loadProjectFromPath.mock.calls[0];
        expect(terminals!()).toEqual([]);
    });

    it('skips a project whose manifest resolves to nothing, and keeps scanning', async () => {
        world.allProjects = [
            { name: 'gone', path: '/projects/gone' },
            { name: 'demo', path: '/projects/demo' },
        ];
        // '/projects/gone' is absent from the map, so the loader resolves undefined
        // rather than throwing — a different case from the unreadable manifest below,
        // and the one a deleted directory produces.
        world.projectsOnDisk = { '/projects/demo': project };
        mockFindStorefrontNameMismatch.mockReturnValue(candidate);

        const out = await harness().call('find_storefront_name_mismatches');

        expect(out).toMatchObject({ scanned: 2, total: 1 });
    });

    it('lists only the projects that actually mismatch', async () => {
        world.allProjects = [
            { name: 'fine', path: '/projects/fine' },
            { name: 'demo', path: '/projects/demo' },
        ];
        // Two DISTINCT projects, so the mismatch check can answer differently for each
        // without depending on call order.
        const alreadyCorrect = { ...project, name: 'fine' };
        world.projectsOnDisk = { '/projects/fine': alreadyCorrect, '/projects/demo': project };
        mockFindStorefrontNameMismatch.mockImplementation((p: unknown) =>
            p === project ? candidate : undefined
        );

        const out = await harness().call('find_storefront_name_mismatches');

        // Both scanned, one reported — a scan that listed every project it read would
        // send the user migrating things that are already correct.
        expect(out).toMatchObject({ scanned: 2, total: 1 });
    });

    it('reports an empty list rather than an error when nothing needs migrating', async () => {
        world.allProjects = [{ name: 'demo', path: '/projects/demo' }];
        world.projectsOnDisk = { '/projects/demo': project };

        const out = await harness().call('find_storefront_name_mismatches');

        expect(out).toEqual({ scanned: 1, total: 0, mismatches: [] });
    });

    it('one unreadable project does not hide the others', async () => {
        world.allProjects = [
            { name: 'broken', path: '/projects/broken' },
            { name: 'demo', path: '/projects/demo' },
        ];
        world.projectsOnDisk = { '/projects/demo': project };
        loadProjectFromPath.mockImplementation(async (path: string) => {
            if (path === '/projects/broken') throw new Error('unreadable manifest');
            return world.projectsOnDisk[path];
        });
        mockFindStorefrontNameMismatch.mockReturnValue(candidate);

        const out = await harness().call('find_storefront_name_mismatches');

        expect(out.total).toBe(1);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('broken'));
    });

    it('pages the list rather than trusting it to stay small', async () => {
        world.allProjects = Array.from({ length: 25 }, (_, i) => ({
            name: `p${i}`,
            path: `/projects/p${i}`,
        }));
        world.projectsOnDisk = Object.fromEntries(world.allProjects.map((p) => [p.path, project]));
        mockFindStorefrontNameMismatch.mockReturnValue(candidate);

        const out = await harness().call('find_storefront_name_mismatches');

        expect(out.total).toBe(25);
        expect(out.mismatches).toHaveLength(20);
    });
});

describe('migrate_storefront_name', () => {
    const atDemo = { projectPath: '/projects/demo' };

    beforeEach(() => {
        world.projectsOnDisk = { '/projects/demo': project };
        mockFindStorefrontNameMismatch.mockReturnValue(candidate);
    });

    it('refuses without confirm and echoes what it would delete', async () => {
        const out = await harness().call('migrate_storefront_name', atDemo);

        expect(String(out.error)).toMatch(/confirmName:"demo"/);
        expect(out.irreversible).toBe(true);
        expect(out.from).toBe('someone/citisignal-one');
        expect(mockMigrateStorefrontNameForProject).not.toHaveBeenCalled();
    });

    it('refuses when the name echo is right but confirm was never given', async () => {
        // Both halves of the gate have to hold. An agent that has read the refusal
        // knows the exact name to echo, so the echo alone is not evidence a human
        // agreed — and this is the call that deletes the old DA.live site root.
        const out = await harness().call('migrate_storefront_name', {
            ...atDemo,
            confirmName: 'demo',
        });

        expect(String(out.error)).toMatch(/confirm/i);
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

        // Fifth argument is the phase reporter — the migration's own steps reach
        // the chat instead of being computed and dropped.
        expect(mockMigrateStorefrontNameForProject).toHaveBeenCalledWith(
            candidate,
            extensionContext,
            logger,
            expect.any(Function),
            expect.any(Function),
        );
        expect(out.migrated).toBe(true);
        expect(out.publishKeyRenewed).toBe(true);
        expect(out.to).toBe('someone/demo-builder-test');
    });

    it('hands the migration a way to persist the project it renamed', async () => {
        await harness().call('migrate_storefront_name', {
            ...atDemo,
            confirm: true,
            confirmName: 'demo',
        });

        // Same rule as the repair: the rename changes the project and the tool owns
        // saving it. A callback that drops the update loses the new site name.
        const persist = mockMigrateStorefrontNameForProject.mock.calls[0][3] as (
            p: unknown
        ) => unknown;
        const renamed = { ...project, name: 'renamed' };
        persist(renamed);
        expect(saveProject).toHaveBeenCalledWith(renamed);
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

    it('reads the target manifest without rewriting it', async () => {
        await harness().call('migrate_storefront_name', atDemo);

        // Same rule as the scan: resolving WHICH project to migrate must not persist
        // the manifest as a side effect of reading it.
        expect(loadProjectFromPath).toHaveBeenCalledWith('/projects/demo', expect.any(Function), {
            persistAfterLoad: false,
        });
        const [, terminals] = loadProjectFromPath.mock.calls[0];
        expect(terminals!()).toEqual([]);
    });

    it('accepts a project path with stray whitespace around it', async () => {
        // Paths arrive from an agent, which may well have copied one out of prose with
        // a trailing newline. Untrimmed, this resolves to nothing and the tool reports
        // the project as missing.
        const out = await harness().call('migrate_storefront_name', {
            projectPath: '  /projects/demo\n',
        });

        expect(String(out.error ?? '')).not.toMatch(/No project found/);
        expect(out.from).toBe('someone/citisignal-one');
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
