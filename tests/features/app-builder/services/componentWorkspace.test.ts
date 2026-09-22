/**
 * The Adobe workspace a component is ADDED into (AB-23 slice 2).
 *
 * Two decisions carry the weight, and both are about what is NOT created.
 *
 * A bound pair joins ONE workspace. They are added as one act and removed as one
 * act, they already share a Runtime namespace by design — `demo-erp` ships
 * `web: no-static-site` because a namespace serves one static site and its
 * integration needs it — and splitting them would need a bespoke credential for
 * calls an Adobe token already covers inside a workspace.
 *
 * And a failure is HARD. An add that carried on would deploy into the project's
 * workspace, where an App Management app's fixed package names overwrite whatever
 * is there — the exact collision this item exists to remove.
 */

import {
    deployWorkspaceId,
    ensureComponentWorkspace,
    inheritedWorkspace,
} from '@/features/app-builder/services/componentWorkspace';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const ERP_INTEGRATION = {
    id: 'erp-integration',
    name: 'Northwind ERP',
    kind: 'integration',
    source: { owner: 'skukla', repo: 'commerce-erp-integration' },
} as AppBuilderComponentCatalogEntry;

const DEMO_ERP = {
    id: 'demo-erp',
    name: 'ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    source: { owner: 'skukla', repo: 'demo-erp' },
} as AppBuilderComponentCatalogEntry;

function projectWith(components: Project['appBuilderComponents'] = {}): Project {
    return createMockProject({
        adobe: { organization: 'org-1', projectId: 'proj-1', workspace: 'ws-project' },
        appBuilderComponents: components,
    });
}

function makerThatCreates(id = 'ws-new', name = 'NorthwindErpq3k9') {
    return {
        createWorkspace: jest.fn().mockResolvedValue({ id, name, title: 'Northwind ERP' }),
    };
}

const saveProject = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
    jest.clearAllMocks();
});

describe('a component that needs its own workspace', () => {
    it('creates one titled for the SC and records id, name and title', async () => {
        const project = projectWith();
        const maker = makerThatCreates();

        const result = await ensureComponentWorkspace(project, ERP_INTEGRATION, {
            maker,
            saveProject,
            nameOf: () => 'Northwind ERP',
        });

        expect(result).toBeUndefined();
        // Titled for the SC, and nothing else is handed over: Adobe's machine name
        // is derived from this title, so Console reads as the SC named it.
        expect(maker.createWorkspace).toHaveBeenCalledWith(
            'Northwind ERP',
            'Demo Builder: erp-integration',
            { orgId: 'org-1', projectId: 'proj-1' },
        );
        expect(project.appBuilderComponents?.['erp-integration'].workspace).toEqual({
            id: 'ws-new',
            name: 'NorthwindErpq3k9',
            title: 'Northwind ERP',
        });
    });

    // A workspace that exists in Adobe but not in the manifest is an orphan nothing
    // can target or delete — the one outcome here a retry cannot undo.
    it('persists the project before returning', async () => {
        const project = projectWith();

        await ensureComponentWorkspace(project, ERP_INTEGRATION, {
            maker: makerThatCreates(),
            saveProject,
            nameOf: () => 'Northwind ERP',
        });

        expect(saveProject).toHaveBeenCalledWith(project);
    });

    it('does nothing when the component already records one', async () => {
        const project = projectWith({
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                workspace: { id: 'ws-already', name: 'AlreadyThere' },
            },
        });
        const maker = makerThatCreates();

        const result = await ensureComponentWorkspace(project, ERP_INTEGRATION, {
            maker,
            saveProject,
            nameOf: () => 'Northwind ERP',
        });

        expect(result).toBeUndefined();
        expect(maker.createWorkspace).not.toHaveBeenCalled();
        expect(saveProject).not.toHaveBeenCalled();
    });
});

describe('a bound pair shares ONE workspace', () => {
    it("a system joins the workspace of the integration it is bound to", async () => {
        const project = projectWith({
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                workspace: { id: 'ws-pair', name: 'NorthwindErpq3k9' },
            },
        });
        const maker = makerThatCreates();

        await ensureComponentWorkspace(project, DEMO_ERP, {
            maker,
            saveProject,
            nameOf: () => 'ERP',
        });

        expect(maker.createWorkspace).not.toHaveBeenCalled();
        expect(project.appBuilderComponents?.['demo-erp'].workspace).toEqual({
            id: 'ws-pair',
            name: 'NorthwindErpq3k9',
        });
    });

    // The binding is declared on the SYSTEM, so an integration added second has to
    // look from the other side — through the `usedBy` its partner recorded.
    it('an integration joins the workspace of a system that names it', async () => {
        const project = projectWith({
            'demo-erp': {
                kind: 'system',
                status: 'deployed',
                source: { owner: 'skukla', repo: 'demo-erp' },
                usedBy: 'erp-integration',
                workspace: { id: 'ws-pair', name: 'ErpQ7x2' },
            },
        });

        expect(inheritedWorkspace(project, ERP_INTEGRATION)).toEqual({
            id: 'ws-pair',
            name: 'ErpQ7x2',
        });
    });

    // A pair's workspace is titled after the ERP, the half the SC names. It was
    // titled after the integration ("ERP Integration", `erpintegration…`) until
    // the owner saw it in Console, 2026-09-21, and expected "Northwind ERP".
    const nameOfPair = (entry: AppBuilderComponentCatalogEntry) =>
        entry.id === 'demo-erp' ? 'Northwind ERP' : 'ERP Integration';

    it("a system that makes the pair's workspace titles it after itself", async () => {
        const maker = makerThatCreates();

        await ensureComponentWorkspace(projectWith(), DEMO_ERP, {
            maker,
            saveProject,
            nameOf: nameOfPair,
            catalog: [ERP_INTEGRATION, DEMO_ERP],
        });

        expect(maker.createWorkspace).toHaveBeenCalledWith(
            'Northwind ERP',
            'Demo Builder: demo-erp',
            { orgId: 'org-1', projectId: 'proj-1' },
        );
    });

    it("an integration that makes the pair's workspace titles it after its ERP", async () => {
        const maker = makerThatCreates();

        await ensureComponentWorkspace(projectWith(), ERP_INTEGRATION, {
            maker,
            saveProject,
            nameOf: nameOfPair,
            catalog: [ERP_INTEGRATION, DEMO_ERP],
        });

        expect(maker.createWorkspace).toHaveBeenCalledWith(
            'Northwind ERP',
            'Demo Builder: demo-erp',
            { orgId: 'org-1', projectId: 'proj-1' },
        );
    });

    // "ERP" is the catalog's word, not a name anyone gave it. With nothing typed,
    // the pair is titled after the integration the SC chose (owner, 2026-09-21).
    it("a pair whose ERP was given no name is titled after its integration", async () => {
        const maker = makerThatCreates();
        const untyped = (entry: AppBuilderComponentCatalogEntry) =>
            entry.id === 'demo-erp' ? 'ERP' : 'ERP Integration';

        await ensureComponentWorkspace(projectWith(), DEMO_ERP, {
            maker,
            saveProject,
            nameOf: untyped,
            catalog: [ERP_INTEGRATION, DEMO_ERP],
        });

        expect(maker.createWorkspace).toHaveBeenCalledWith(
            'ERP Integration',
            'Demo Builder: demo-erp',
            { orgId: 'org-1', projectId: 'proj-1' },
        );
    });

    it('CONTROL: an unrelated deployed component is NOT inherited from', async () => {
        const project = projectWith({
            'some-other-integration': {
                kind: 'integration',
                status: 'deployed',
                source: { owner: 'skukla', repo: 'other' },
                workspace: { id: 'ws-other', name: 'Other' },
            },
        });

        expect(inheritedWorkspace(project, ERP_INTEGRATION)).toBeUndefined();
    });
});

// The mesh is the project's permanent core and lives in the project's workspace —
// Production — where the storefront calls it (AB-23, owner 2026-09-20). Every other
// add gets its own workspace, and a dashboard-added mesh used to get one too.
describe('a mesh', () => {
    it('never gets a workspace of its own', async () => {
        const project = projectWith();
        const maker = makerThatCreates();
        const MESH = { id: 'eds-accs-mesh', name: 'API Mesh', kind: 'mesh', source: { owner: 'o', repo: 'm' } } as AppBuilderComponentCatalogEntry;

        const result = await ensureComponentWorkspace(project, MESH, { maker, saveProject, nameOf: () => 'API Mesh' });

        expect(result).toBeUndefined();
        expect(maker.createWorkspace).not.toHaveBeenCalled();
        expect(project.appBuilderComponents?.['eds-accs-mesh']).toBeUndefined();
    });
});

describe('when Adobe refuses', () => {
    it('answers a reason naming the component, and records nothing', async () => {
        const project = projectWith();
        const maker = {
            createWorkspace: jest.fn().mockResolvedValue({ error: 'Quota exceeded (403).' }),
        };

        const result = await ensureComponentWorkspace(project, ERP_INTEGRATION, {
            maker,
            saveProject,
            nameOf: () => 'Northwind ERP',
        });

        expect(result).toEqual({
            error:
                'Couldn\'t make an Adobe workspace for "Northwind ERP", so it was not added. ' +
                'Quota exceeded (403).',
        });
        expect(project.appBuilderComponents?.['erp-integration']).toBeUndefined();
        expect(saveProject).not.toHaveBeenCalled();
    });
});

// AB-23 slice 5: the credential an App Management app authenticates with is the
// one in the workspace it is deployed into.
describe('the workspace a component is deployed into', () => {
    it('is its own when it has one', () => {
        const project = projectWith({
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                workspace: { id: 'ws-erp', name: 'erp-integration' },
            },
        });

        expect(deployWorkspaceId(project, 'erp-integration')).toBe('ws-erp');
    });

    it("is the project's for a component added before AB-23", () => {
        const project = projectWith({
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                source: { owner: 'skukla', repo: 'commerce-erp-integration' },
            },
        });

        expect(deployWorkspaceId(project, 'erp-integration')).toBe('ws-project');
    });
});
