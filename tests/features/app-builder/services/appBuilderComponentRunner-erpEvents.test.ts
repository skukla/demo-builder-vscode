/**
 * Deploy-contract runner — the event address and publishing credential an ADDED ERP is
 * deployed with (AB-16i).
 *
 * Which entries get them is `erpEventsDelivery`'s question (its own suite). What is pinned
 * here is the seam: every app deploy, add and redeploy alike, asks it, merges the answer
 * into the deploy's per-invocation env and nowhere else, and says the note it gives.
 */

import './appBuilderComponentRunner.runtimeMock';
import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

jest.setTimeout(5000);

jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    listDeclaredTriggersAndRules: jest.fn().mockResolvedValue({ triggers: [], rules: [] }),
    detectAppLayout: jest.fn().mockResolvedValue('standalone'),
}));

import {
    addAppBuilderComponent,
    deployAppBuilderComponent,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import type { ErpEventsEnv } from '@/features/app-builder/services/erpEventsDelivery';
import type { Project } from '@/types/base';
import { createDeps, createProject } from './appBuilderComponentRunner.testUtils';

const ERP: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp-2',
    catalogId: 'demo-erp',
    name: 'Contoso ERP',
    description: 'an added ERP',
    kind: 'system',
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};

const SECRET = 'fake-test-pw-not-a-secret';
const EVENTS_ENV = {
    EVENTS_WEBHOOK_URL: 'https://ns-integration.adobeio-static.net/api/v1/web/ingestion/webhook',
    EVENTS_AUTH_CLIENT_ID: 'fake-integration-client',
    EVENTS_AUTH_CLIENT_SECRET: SECRET,
    EVENTS_AUTH_ORG_ID: 'FAKE@AdobeOrg',
    EVENTS_AUTH_SCOPES: '["AdobeID"]',
};

type DeployCall = [string, string, unknown, unknown, { extraEnv?: Record<string, string> }];

function wired(answer: ErpEventsEnv) {
    const resolveEventsEnv = jest.fn(async () => answer);
    const deps = createDeps({ catalog: [ERP], resolveEventsEnv });
    return { deps, resolveEventsEnv };
}

function erpDeployed(project: Project): Project {
    project.appBuilderComponents = {
        'demo-erp-2': { kind: 'system', catalogId: 'demo-erp', status: 'deployed', name: 'Contoso ERP', source: ERP.source },
    };
    project.componentInstances = { 'demo-erp-2': { id: 'demo-erp-2', name: 'Contoso ERP', status: 'ready', path: '/proj/components/demo-erp-2' } };
    return project;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

describe("an added ERP's event delivery", () => {
    it('hands the add its event address and publishing credential, asked for THIS entry', async () => {
        const project = createProject();
        const { deps, resolveEventsEnv } = wired({ env: EVENTS_ENV });

        const result = await addAppBuilderComponent(project, ERP, deps);

        expect(result.success).toBe(true);
        expect(resolveEventsEnv).toHaveBeenCalledWith(project, expect.objectContaining({ id: 'demo-erp-2' }));
        const [[, , , , opts]] = (deps.deployApp as jest.Mock).mock.calls as DeployCall[];
        expect(opts.extraEnv).toMatchObject(EVENTS_ENV);
    });

    it('hands a redeploy the same, so an ERP deployed before this change gets it', async () => {
        const project = erpDeployed(createProject());
        const { deps } = wired({ env: EVENTS_ENV });

        const result = await deployAppBuilderComponent(project, 'demo-erp-2', deps);

        expect(result.success).toBe(true);
        const [[, , , , opts]] = (deps.deployApp as jest.Mock).mock.calls as DeployCall[];
        expect(opts.extraEnv).toMatchObject(EVENTS_ENV);
    });

    it('never writes the publishing secret into the saved project', async () => {
        const project = createProject();
        const { deps } = wired({ env: EVENTS_ENV });

        await addAppBuilderComponent(project, ERP, deps);

        const saved = JSON.stringify((deps.saveProject as jest.Mock).mock.calls);
        expect(saved).toContain('demo-erp-2');
        expect(saved).not.toContain(SECRET);
    });

    it('deploys with nothing added and says why, when there is nothing to give', async () => {
        const project = erpDeployed(createProject());
        const note = "Contoso ERP's events will wait in its own outbox: the integration has no event address yet.";
        const { deps } = wired({ env: {}, note });

        const result = await deployAppBuilderComponent(project, 'demo-erp-2', deps);

        expect(result.success).toBe(true);
        expect(result.warnings).toContain(note);
        const [[, , , , opts]] = (deps.deployApp as jest.Mock).mock.calls as DeployCall[];
        expect(opts.extraEnv ?? {}).not.toHaveProperty('EVENTS_WEBHOOK_URL');
    });
});
