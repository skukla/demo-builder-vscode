/**
 * aiHandlers — the creationProgress PAYLOADS the regenerate path emits.
 *
 * Split from aiHandlers-regenerate.test.ts, which pins WHICH steps are emitted
 * and in what order. This file pins what each message actually carries: the
 * percentage, which is computed from a running step count against a total that
 * differs by project shape, and the two callbacks the handler hands its
 * collaborators so their own output reaches the same channel.
 *
 * Those callbacks are the part a mock cannot see by itself: `installAiDefaults-
 * McpTools` and `generateAIContextFiles` are both mocked, so a handler that
 * passed them a function doing nothing would look identical unless the fake
 * CALLS what it was given and the test reads what came back out.
 */

import {
    handleRegenerateAiFiles,
    generateAIContextFiles,
    installAiDefaultsMcpTools,
    createAiHandlerContext,
    seedCommandExecutor,
} from './aiHandlers.testUtils';
import { COMPONENT_IDS } from '@/core/constants';
import type { CreationProgressPayload } from '@/types/webviewPayloads';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const PROJECT_HEADLESS = {
    name: 'Test Project',
    path: '/projects/test',
    stack: 'paas',
    componentInstances: {},
};
const PROJECT_WITH_STOREFRONT = {
    name: 'Test Project',
    path: '/projects/test',
    stack: 'paas',
    componentInstances: {
        [COMPONENT_IDS.EDS_STOREFRONT]: { path: '/projects/test/components/eds-storefront' },
    },
};

function contextFor(project: unknown) {
    return createAiHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProjectConfigOnly: jest.fn(),
        }),
    });
}

/** Every creationProgress payload the handler pushed, in order. */
function progressPayloads(context: { sendMessage: unknown }): CreationProgressPayload[] {
    return (context.sendMessage as jest.Mock).mock.calls
        .filter(([type]) => type === 'creationProgress')
        .map(([, payload]) => payload as CreationProgressPayload);
}

describe('handleRegenerateAiFiles — creationProgress payloads', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedCommandExecutor();
    });

    it('counts each step up against the four a headless project has', async () => {
        // The writers report through the tracker the handler hands over; the
        // handler adds the finalize step itself. Four steps, four quarters.
        (generateAIContextFiles as jest.Mock).mockImplementation(
            async (
                _path: string,
                _project: unknown,
                _ext: string,
                onProgress: (op: string, progress: number, message?: string) => void,
            ) => {
                onProgress('Writing AGENTS.md', 0);
                onProgress('Writing MCP configuration', 0);
                onProgress('Writing skills', 0, 'four skills');
                return { skills: [] };
            },
        );
        const context = contextFor(PROJECT_HEADLESS);

        await handleRegenerateAiFiles(context);

        const payloads = progressPayloads(context);
        expect(payloads.map((p) => p.currentOperation)).toEqual([
            'Writing AGENTS.md',
            'Writing MCP configuration',
            'Writing skills',
            'Finalizing',
        ]);
        expect(payloads.map((p) => p.progress)).toEqual([25, 50, 75, 100]);
        // The writer's own message rides along; a step without one sends ''.
        expect(payloads[2].message).toBe('four skills');
        expect(payloads[0].message).toBe('');
        // Regenerate has no log stream of its own — the field is always empty.
        expect(payloads[0].logs).toStrictEqual([]);
    });

    it('counts against FIVE steps when the download step runs, and forwards npm output', async () => {
        (installAiDefaultsMcpTools as jest.Mock).mockImplementation(
            async (
                _path: string,
                _project: unknown,
                _executor: unknown,
                onOutput: (line: string) => void,
            ) => {
                onOutput('added 12 packages in 3s');
                return { success: true };
            },
        );
        (generateAIContextFiles as jest.Mock).mockResolvedValue({ skills: [] });
        const context = contextFor(PROJECT_WITH_STOREFRONT);

        await handleRegenerateAiFiles(context);

        const payloads = progressPayloads(context);
        // Step 1 announces the download, step 2 is the npm line it streamed back,
        // step 3 is finalize — 1/5, 2/5, 3/5.
        expect(payloads.map((p) => p.progress)).toEqual([20, 40, 60]);
        expect(payloads[1]).toMatchObject({
            currentOperation: 'Downloading AI tool packages',
            message: 'added 12 packages in 3s',
        });
        expect(payloads[2].currentOperation).toBe('Finalizing');
    });
});
