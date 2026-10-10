/**
 * get_storefront_report (EDS-13f steps 04 and 07): the agent's door to the
 * same report the command shows: read-only, on the open EDS project, with the
 * structured section AND the SC wording, so an agent says what a person reads.
 * The report computation is tested in `storefrontReport.test.ts`.
 */

jest.mock('@/features/eds/services/storefront/storefrontReport', () => ({
    readStorefrontReport: jest.fn(),
    storefrontReportLines: jest.fn(() => ['## Where this storefront comes from', 'Built on X.']),
}));
jest.mock('@/features/eds/services/storefront/storefrontReportDeps', () => ({
    createStorefrontReportDeps: jest.fn(() => ({ marker: 'deps' })),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(),
    getDaLiveAuthService: jest.fn(),
}));
jest.mock('@/types/typeGuards', () => ({ isEdsProject: jest.fn() }));

import { registerStorefrontTools } from '@/features/ai/server/storefrontTools';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { readStorefrontReport } from '@/features/eds/services/storefront/storefrontReport';
import { createStorefrontReportDeps } from '@/features/eds/services/storefront/storefrontReportDeps';
import { isEdsProject } from '@/types/typeGuards';
import { expectWithinCeiling } from './responseCeilings';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

type Handler = (args?: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;

function server() {
    const tools = new Map<string, { def: McpToolSchema; handler: Handler }>();
    return {
        registerTool(name: string, def: McpToolSchema, handler: Handler) {
            tools.set(name, { def, handler });
        },
        def: () => tools.get('get_storefront_report')!.def,
        call: async () => JSON.parse((await tools.get('get_storefront_report')!.handler({})).content[0].text),
    };
}

const getCurrentProject = jest.fn();
const secrets = createMockSecretStorage().secrets;
const ctxFactory = () =>
    createMockHandlerContext({
        stateManager: createMockStateManager({ getCurrentProject }),
        context: createMockExtensionContext({ secrets }),
        logger: createMockLogger(),
    });
const PROJECT = { name: 'aistore-copy', path: '/p' };
const REPORT = { repository: { owner: 'steve', repo: 'aistore-copy' }, fixes: [], offer: ['pdp-empty-data-redirect'] };

beforeEach(() => {
    jest.clearAllMocks();
    getCurrentProject.mockResolvedValue(PROJECT);
    (isEdsProject as unknown as jest.Mock).mockReturnValue(true);
    (getGitHubServices as jest.Mock).mockReturnValue({ tokenService: { validateToken: jest.fn(async () => ({ valid: true })) } });
    (readStorefrontReport as jest.Mock).mockResolvedValue(REPORT);
});

describe('get_storefront_report', () => {
    it('declares a read that needs GitHub, and takes no arguments', () => {
        const s = server();
        registerStorefrontTools(s, ctxFactory);

        expect(s.def().annotations).toEqual({ readOnlyHint: true, destructiveHint: false });
        expect(s.def().needsAuth).toEqual(['github']);
        expect(s.def().inputSchema).toStrictEqual({});
    });

    it("reads the open project's report and answers the section with the words a person reads", async () => {
        const s = server();
        registerStorefrontTools(s, ctxFactory);

        const res = await s.call();

        expect(createStorefrontReportDeps).toHaveBeenCalledWith(secrets, expect.anything());
        expect(readStorefrontReport).toHaveBeenCalledWith(PROJECT, { marker: 'deps' });
        expect(res).toEqual({ ...REPORT, summary: ['## Where this storefront comes from', 'Built on X.'] });
    });

    it('stays within its recorded size on a full report: seven fixes and every line', async () => {
        const actual = jest.requireActual('@/features/eds/services/storefront/storefrontReport');
        const ids = ['product-link-sku-encoding', 'product-link-sku-slash-encoding', 'product-teaser-sku-encoding', 'pdp-empty-data-redirect', 'aem-assets-sku-sanitization', 'header-nav-tools-defensive', 'commerce-account-sidebar-selector-race'];
        const full = {
            repository: { owner: 'steve', repo: 'aistore-copy' },
            boilerplate: { status: 'read', value: { name: '@adobe/aem-boilerplate-commerce', version: '4.0.1' } },
            current: { status: 'read', value: { name: '@adobe/aem-boilerplate-commerce', version: '6.0.0' } },
            origin: { kind: 'added', lineage: { status: 'read', value: { templateRepository: { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' } } }, match: { by: 'template', template: { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' } } },
            written: { smart404: 'present', fstab: 'present', config: 'present', description: 'absent' },
            fixes: ids.map((patchId) => ({ patchId, target: `blocks/${patchId}/${patchId}.js`, state: 'missing', reason: 'Precondition not found (target has changed — possible template/library drift)' })),
            offer: ids.slice(0, 4),
        };
        (readStorefrontReport as jest.Mock).mockResolvedValue(full);
        const { storefrontReportLines } = jest.requireMock('@/features/eds/services/storefront/storefrontReport');
        (storefrontReportLines as jest.Mock).mockImplementationOnce(actual.storefrontReportLines);
        const s = server();
        registerStorefrontTools(s, ctxFactory);

        expectWithinCeiling('get_storefront_report', JSON.stringify(await s.call()));
    });

    it('refuses a project that is not an Edge Delivery storefront, and hands off when GitHub is not signed in', async () => {
        const s = server();
        registerStorefrontTools(s, ctxFactory);
        (isEdsProject as unknown as jest.Mock).mockReturnValueOnce(false);
        expect(await s.call()).toEqual({ error: 'get_storefront_report applies only to EDS storefront projects' });

        (getGitHubServices as jest.Mock).mockReturnValue({ tokenService: { validateToken: jest.fn(async () => ({ valid: false })) } });
        expect(await s.call()).toMatchObject({ needsAuth: 'github' });
        expect(readStorefrontReport).not.toHaveBeenCalled();
    });

    it('says the GitHub sign-in is for reading the storefront', async () => {
        (getGitHubServices as jest.Mock).mockReturnValue({ tokenService: { validateToken: jest.fn(async () => ({ valid: false })) } });
        const s = server();
        registerStorefrontTools(s, ctxFactory);

        const res = await s.call();

        expect(res.message).toContain('GitHub sign-in required to read the storefront.');
    });

    it('answers a plain error, not an empty report, when the project records no storefront repository', async () => {
        // readStorefrontReport answers nothing at all for a project with no repo
        // metadata. Spreading that would hand the agent `{ summary: [...] }`: a report
        // with words and no facts behind them.
        (readStorefrontReport as jest.Mock).mockResolvedValue(undefined);
        const { storefrontReportLines } = jest.requireMock('@/features/eds/services/storefront/storefrontReport');
        const s = server();
        registerStorefrontTools(s, ctxFactory);

        const res = await s.call();

        expect(res).toStrictEqual({ error: 'Project is missing GitHub repo metadata' });
        expect(storefrontReportLines).not.toHaveBeenCalled();
    });
});
