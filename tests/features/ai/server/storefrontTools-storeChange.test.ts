/**
 * The agent's `republish` after a store change (EDS-44).
 *
 * `republish` runs the dashboard Republish's content pipeline (EDS-63), which replaces
 * the old store's product and category pages itself; the tool hands it the state manager
 * and carries its sentence back. The replacement is the pipeline's, tested in
 * `storefrontContentRepublishService-storeChange.test.ts`.
 *
 * Services walled; asserted by what each is handed.
 */

jest.mock('@/features/eds/services/storefront/storefrontContentRepublishService', () => ({
    republishStorefrontContent: jest.fn(),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(),
    getDaLiveAuthService: jest.fn(),
}));
jest.mock('@/types/typeGuards', () => ({ isEdsProject: jest.fn(() => true) }));
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    getAdobeTarget: jest.fn(() => ({ orgId: 'org-stored' })),
    runWithAdobeTarget: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { COMPONENT_IDS } from '@/core/constants';
import { withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { McpToolServer } from '@/features/ai/server/mcpToolServer';
import { registerStorefrontTools } from '@/features/ai/server/storefrontTools';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { republishStorefrontContent } from '@/features/eds/services/storefront/storefrontContentRepublishService';
import type { Project } from '@/types/base';
import { expectWithinCeiling } from './responseCeilings';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const SENTENCE = 'Now on CitiSignal: 11 category pages and 39 product pages published. 30 old product pages removed.';
const tokenService = { validateToken: jest.fn(async () => ({ valid: true })) };
const fileOperations = { getFileContent: jest.fn() };
const daLiveAuthService = { isAuthenticated: jest.fn(async () => true) };

const getCurrentProject = jest.fn();
const stateManager = createMockStateManager({ getCurrentProject });
const logger = createMockLogger();
const ctxFactory = () =>
    createMockHandlerContext({
        stateManager,
        logger,
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
    });

function storefront(pending: boolean): Project {
    return createMockProject({
        name: 'shop',
        path: '/p/shop',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: 'me/shop', daLiveOrg: 'acme', daLiveSite: 'shop' },
            },
        },
        edsStorefrontState: {
            envVars: {},
            lastPublished: '2026-10-15T00:00:00.000Z',
            ...(pending
                ? { catalogPagesPending: { fromWebsiteCode: 'base', fromStoreCode: 'main', fromStoreViewCode: 'default' } }
                : {}),
        },
    });
}

function server() {
    type Handler = (args?: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    const tools = new Map<string, Handler>();
    const fake: McpToolServer = {
        registerTool: (name, _schema, handler) => {
            tools.set(name, handler);
        },
    };
    registerStorefrontTools(fake, ctxFactory);
    return async (name: string) => JSON.parse((await tools.get(name)!({ confirm: true })).content[0].text);
}

beforeEach(() => {
    jest.clearAllMocks();
    (getGitHubServices as jest.Mock).mockReturnValue({ tokenService, fileOperations });
    (getDaLiveAuthService as jest.Mock).mockReturnValue(daLiveAuthService);
});

describe('republish', () => {
    it('hands the pipeline the state manager and answers with its store-change sentence', async () => {
        getCurrentProject.mockResolvedValue(storefront(true));
        (republishStorefrontContent as jest.Mock).mockResolvedValue({
            success: true,
            cdnVerified: true,
            storePages: SENTENCE,
        });

        const answer = await server()('republish');

        expect((republishStorefrontContent as jest.Mock).mock.calls[0][0].stateManager).toBe(stateManager);
        expect(answer).toMatchObject({ success: true, storePages: SENTENCE });
        expectWithinCeiling('republish', JSON.stringify(answer));
    });
});

// Every flow names its steps the same way (progress vocabulary slice 3, owner
// 2026-10-16). Under an agent each step reaches the agent's notification and the chat
// once, by its table name, as it starts; the lines under a step are the modal's detail
// and stay out of the chat.
describe('the steps an agent is told', () => {
    const S = OPERATION_STAGES;

    async function phasesOf(tool: string): Promise<string[]> {
        const phases: string[] = [];
        await withPhaseSinks([(m) => phases.push(m)], () => server()(tool));
        return phases;
    }

    it('republish: each step of the content publish, once', async () => {
        getCurrentProject.mockResolvedValue(storefront(false));
        (republishStorefrontContent as jest.Mock).mockImplementation(
            async (params: { onStage?: (stage: string, step?: string) => void }) => {
                params.onStage?.(S.publishingSettings.label);
                params.onStage?.(S.publishingSettings.label, 'Publishing the settings: Writing config.json');
                params.onStage?.(S.publishingPages.label);
                params.onStage?.(S.publishingPages.label, 'Publishing the pages: 32 of 64 pages');
                params.onStage?.(S.checkingSettings.label);
                return { success: true, cdnVerified: true };
            },
        );

        expect(await phasesOf('republish')).toStrictEqual([
            S.publishingSettings.label,
            S.publishingPages.label,
            S.checkingSettings.label,
        ]);
    });
});
