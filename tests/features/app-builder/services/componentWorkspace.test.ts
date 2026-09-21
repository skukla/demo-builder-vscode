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
        // The TITLE is the SC's name — the only field a rename can safely follow,
        // because Adobe refuses to change a machine name after creation.
        // Named after the id, which never changes; titled for the SC.
        expect(maker.createWorkspace).toHaveBeenCalledWith(
            'Northwind ERP',
            'Demo Builder: erp-integration',
            { orgId: 'org-1', projectId: 'proj-1' },
            'erp-integration',
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

    // The system is added first, so it makes the pair's workspace — and it used to
    // name it after itself: "ERP", `demoerp…` (2026-09-21). The SC added the
    // integration; the workspace is the integration's, titled and named for it.
    it("a system that makes the pair's workspace names it after its integration", async () => {
        const project = projectWith();
        const maker = makerThatCreates();
        const nameOf = (entry: AppBuilderComponentCatalogEntry) =>
            entry.id === 'erp-integration' ? 'ERP integration' : 'Northwind ERP';

        await ensureComponentWorkspace(project, DEMO_ERP, {
            maker,
            saveProject,
            nameOf,
            catalog: [ERP_INTEGRATION, DEMO_ERP],
        });

        expect(maker.createWorkspace).toHaveBeenCalledWith(
            'ERP integration',
            'Demo Builder: erp-integration',
            { orgId: 'org-1', projectId: 'proj-1' },
            'erp-integration',
        );
    });

    it('a system whose integration is not in the catalog names the workspace after itself', async () => {
        const project = projectWith();
        const maker = makerThatCreates();

        await ensureComponentWorkspace(project, DEMO_ERP, {
            maker,
            saveProject,
            nameOf: () => 'Northwind ERP',
            catalog: [DEMO_ERP],
        });

        expect(maker.createWorkspace).toHaveBeenCalledWith(
            'Northwind ERP',
            'Demo Builder: demo-erp',
            { orgId: 'org-1', projectId: 'proj-1' },
            'demo-erp',
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
