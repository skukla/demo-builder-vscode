/**
 * What the Console API handlers persist and send per workspace (AB-23).
 *
 * The per-integration workspace code landed on 2026-09-21 and the file's mutation
 * row was measured before it. Re-measuring for PL-69 sitting 8 found seven
 * branch survivors and eight uncovered mutants in it: an owner emptied by a set
 * was never checked to be removed, a code Adobe refused was never checked to be
 * dropped from only the asking owner, the own-workspace catalog filter never ran
 * (the catalog mock is empty), and the subscribe's progress callbacks were never
 * invoked. Each case here pins one of those by what reaches the collaborator or
 * the saved project, not by the handler's success flag.
 */

import {
    getAvailableAppBuilderComponents,
    handleAddConsoleApis,
    handleListConsoleApis,
    handleSetConsoleApis,
    consoleApiContext,
    consoleApiProject,
    subscribeRequiredApis,
} from './consoleApiHandlers.testUtils';
import { CONSOLE_APIS_OPERATION_ID } from '@/core/utils/operationIds';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { pushOperationProgress } from '@/core/vscode/operationProgress';
import { ErrorCode } from '@/types/errorCodes';

jest.mock('@/core/vscode/operationProgress', () => ({
    pushOperationProgress: jest.fn(),
}));

const BASELINE = { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API' };

/** erp-sync in a workspace of its own, firefly-app on the project's. */
function twoWorkspaceProject() {
    return consoleApiProject({
        appBuilderComponents: {
            'erp-sync': {
                kind: 'integration',
                status: 'deployed',
                name: 'ERP Sync',
                source: { owner: 'o', repo: 'r' },
                workspace: { id: 'ws-erp-own', name: 'ErpSyncq3k9' },
            },
            'firefly-app': {
                kind: 'integration',
                status: 'deployed',
                name: 'Firefly App',
                source: { owner: 'o', repo: 'r' },
            },
        },
        componentApiPicks: {
            'erp-sync': ['FireflyAPISDK', 'GraphQLServiceSDK'],
            'firefly-app': ['GraphQLServiceSDK'],
        },
    });
}

function catalogEntry(id: string, requiredApis: string[]) {
    return {
        id,
        name: id,
        description: '',
        kind: 'integration',
        requiredApis,
        source: { owner: 'o', repo: 'r', branch: 'main' },
    };
}

function savedProject(context: ReturnType<typeof consoleApiContext>) {
    return (context.stateManager.saveProject as jest.Mock).mock.calls[0][0] as {
        componentApiPicks: Record<string, string[]>;
    };
}

beforeEach(() => jest.clearAllMocks());

describe('an owner left with nothing', () => {
    it('is removed from the picks, not kept as an empty key', async () => {
        const context = consoleApiContext(twoWorkspaceProject());

        await handleSetConsoleApis(context, { componentId: 'firefly-app', apis: [] });

        expect(savedProject(context).componentApiPicks).toEqual({
            'erp-sync': ['FireflyAPISDK', 'GraphQLServiceSDK'],
        });
    });
});

describe('a code Adobe refused', () => {
    it("is dropped from the asking owner only, in that owner's own workspace", async () => {
        (subscribeRequiredApis as jest.Mock).mockResolvedValueOnce([
            BASELINE,
            { code: 'FireflyAPISDK' },
        ]);
        const context = consoleApiContext(twoWorkspaceProject());

        const result = await handleSetConsoleApis(context, {
            componentId: 'erp-sync',
            apis: ['FireflyAPISDK', 'LegacyEventsSDK'],
        });

        expect(result.success).toBe(false);
        expect(result.data).toEqual({
            subscribed: [BASELINE, { code: 'FireflyAPISDK' }],
            notSubscribed: ['LegacyEventsSDK'],
        });
        // firefly-app's pick is not in `taken` (that workspace never held it) and
        // must survive untouched; erp-sync keeps only what Adobe took.
        expect(savedProject(context).componentApiPicks).toEqual({
            'erp-sync': ['FireflyAPISDK'],
            'firefly-app': ['GraphQLServiceSDK'],
        });
    });

    it('removes an owner whose every code was refused on a shared workspace', async () => {
        (subscribeRequiredApis as jest.Mock).mockResolvedValueOnce([
            BASELINE,
            { code: 'FireflyAPISDK' },
        ]);
        const project = twoWorkspaceProject();
        delete (project.appBuilderComponents as Record<string, Record<string, unknown>>)[
            'erp-sync'
        ].workspace;
        const context = consoleApiContext(project);

        await handleSetConsoleApis(context, {
            componentId: 'firefly-app',
            apis: ['GraphQLServiceSDK'],
        });

        expect(savedProject(context).componentApiPicks).toEqual({
            'erp-sync': ['FireflyAPISDK'],
        });
    });
});

describe('the catalog entries the subscribe is handed', () => {
    beforeEach(() => {
        (getAvailableAppBuilderComponents as jest.Mock).mockReturnValue([
            catalogEntry('erp-sync', ['LegacyEventsSDK']),
            catalogEntry('firefly-app', ['FireflyAPISDK']),
        ]);
    });

    afterEach(() => {
        (getAvailableAppBuilderComponents as jest.Mock).mockReturnValue([]);
    });

    it("in a component's own workspace: only that component's entry", async () => {
        const context = consoleApiContext(twoWorkspaceProject());

        await handleSetConsoleApis(context, { componentId: 'erp-sync', apis: ['FireflyAPISDK'] });

        const catalog = (subscribeRequiredApis as jest.Mock).mock.calls[0][0] as Array<{ id: string }>;
        expect(catalog.map((entry) => entry.id)).toEqual(['erp-sync']);
    });

    it("on the project's workspace: every entry except those living elsewhere", async () => {
        const context = consoleApiContext(twoWorkspaceProject());

        await handleSetConsoleApis(context, { componentId: 'firefly-app', apis: ['FireflyAPISDK'] });

        const catalog = (subscribeRequiredApis as jest.Mock).mock.calls[0][0] as Array<{ id: string }>;
        expect(catalog.map((entry) => entry.id)).toEqual(['firefly-app']);
    });
});

describe('the subscribe progress callbacks', () => {
    it('push each step on the Console APIs operation', async () => {
        (subscribeRequiredApis as jest.Mock).mockImplementationOnce(
            async (
                _catalog: unknown,
                _target: unknown,
                _client: unknown,
                _domain: unknown,
                _extras: unknown,
                _unused: unknown,
                _removing: unknown,
                opts: { onStep: (step: string) => void; log: (message: string) => void },
            ) => {
                opts.onStep('Subscribing FireflyAPISDK');
                opts.log('subscribe line');
                return [BASELINE, { code: 'FireflyAPISDK' }];
            },
        );
        const context = consoleApiContext(twoWorkspaceProject());

        await handleSetConsoleApis(context, { apis: ['FireflyAPISDK'] });

        expect(pushOperationProgress).toHaveBeenCalledWith({
            id: CONSOLE_APIS_OPERATION_ID,
            state: 'running',
            stage: OPERATION_STAGES.subscribingApis.label,
            step: 'Subscribing FireflyAPISDK',
        });
    });
});

describe('a project that has no integrations block at all', () => {
    it('set with a componentId still answers on the project workspace', async () => {
        const project = consoleApiProject({ componentApiPicks: { 'erp-sync': ['FireflyAPISDK'] } });
        const context = consoleApiContext(project);

        const result = await handleSetConsoleApis(context, {
            componentId: 'erp-sync',
            apis: ['FireflyAPISDK'],
        });

        expect(result.success).toBe(true);
        const call = (subscribeRequiredApis as jest.Mock).mock.calls[0];
        expect(call[1]).toEqual(expect.objectContaining({ workspaceId: 'w-1' }));
    });

    it('add with a componentId refuses as an unknown integration rather than throwing', async () => {
        const context = consoleApiContext(consoleApiProject());

        const result = await handleAddConsoleApis(context, {
            componentId: 'erp-sync',
            apis: ['FireflyAPISDK'],
        });

        expect(result).toEqual({
            success: false,
            error: 'This project has no integration "erp-sync".',
            code: ErrorCode.CONFIG_INVALID,
        });
        expect(subscribeRequiredApis).not.toHaveBeenCalled();
    });
});

describe('an integration with no picks yet', () => {
    it('add sends only the new code as its list', async () => {
        const project = twoWorkspaceProject();
        delete (project as { componentApiPicks?: unknown }).componentApiPicks;
        const context = consoleApiContext(project);

        await handleAddConsoleApis(context, { componentId: 'erp-sync', apis: ['FireflyAPISDK'] });

        expect((subscribeRequiredApis as jest.Mock).mock.calls[0][4]).toEqual(['FireflyAPISDK']);
    });

    it('list reports an empty `added` for it, not the union', async () => {
        const project = twoWorkspaceProject();
        (project.componentApiPicks as Record<string, string[]>) = { 'erp-sync': ['FireflyAPISDK'] };
        const context = consoleApiContext(project);

        const result = await handleListConsoleApis(context, { componentId: 'firefly-app' });

        expect((result.data as { added: string[] }).added).toStrictEqual([]);
    });
});

// Reads that must tolerate a missing entry: a set naming an integration the
// project no longer has, and a mesh entry, which the catalog scope always keeps
// whether or not the project lists it as an integration.
describe('entries the project does not list', () => {
    function meshEntry() {
        return { ...catalogEntry('api-mesh', ['GraphQLServiceSDK']), kind: 'mesh' };
    }

    afterEach(() => {
        (getAvailableAppBuilderComponents as jest.Mock).mockReturnValue([]);
    });

    it('set for an integration the project no longer has goes to the project workspace', async () => {
        const context = consoleApiContext(twoWorkspaceProject());

        const result = await handleSetConsoleApis(context, {
            componentId: 'removed-app',
            apis: ['FireflyAPISDK'],
        });

        expect(result.success).toBe(true);
        const call = (subscribeRequiredApis as jest.Mock).mock.calls[0];
        expect(call[1]).toEqual(expect.objectContaining({ workspaceId: 'w-1' }));
    });

    it('a mesh entry the integrations block does not name stays in the shared catalog', async () => {
        (getAvailableAppBuilderComponents as jest.Mock).mockReturnValue([meshEntry()]);
        const context = consoleApiContext(twoWorkspaceProject());

        const result = await handleSetConsoleApis(context, { apis: ['FireflyAPISDK'] });

        expect(result.success).toBe(true);
        const catalog = (subscribeRequiredApis as jest.Mock).mock.calls[0][0] as Array<{ id: string }>;
        expect(catalog.map((entry) => entry.id)).toEqual(['api-mesh']);
    });

    it('a mesh entry stays in the catalog for a project with no integrations block', async () => {
        (getAvailableAppBuilderComponents as jest.Mock).mockReturnValue([meshEntry()]);
        const context = consoleApiContext(consoleApiProject());

        const result = await handleSetConsoleApis(context, { apis: ['FireflyAPISDK'] });

        expect(result.success).toBe(true);
        const catalog = (subscribeRequiredApis as jest.Mock).mock.calls[0][0] as Array<{ id: string }>;
        expect(catalog.map((entry) => entry.id)).toEqual(['api-mesh']);
    });
});
