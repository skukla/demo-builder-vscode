/**
 * get_demo_package_preview, save_demo_package and remove_demo_package — the
 * agent's doors for "Save as demo package". The dashboard handlers behind them
 * are mocked at the module boundary; what is asserted is the gate, the
 * refusal's words, and the ARGUMENTS each handler receives.
 */

jest.mock('@/features/dashboard/handlers/demoPackageHandlers', () => ({
    handleGetDemoPackagePreview: jest.fn(),
    handleSaveDemoPackage: jest.fn(),
    handleRemoveDemoPackage: jest.fn(),
}));
jest.mock('@/features/ai/server/edsToolGuards', () => ({
    requireGitHub: jest.fn(),
}));

import { registerDemoPackageTools } from '@/features/ai/server/demoPackageTools';
import { requireGitHub } from '@/features/ai/server/edsToolGuards';
import {
    handleGetDemoPackagePreview,
    handleRemoveDemoPackage,
    handleSaveDemoPackage,
} from '@/features/dashboard/handlers/demoPackageHandlers';
import type { DemoPackagePreview } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const mockRequireGitHub = requireGitHub as jest.Mock;
const mockPreview = handleGetDemoPackagePreview as jest.Mock;
const mockSave = handleSaveDemoPackage as jest.Mock;
const mockRemove = handleRemoveDemoPackage as jest.Mock;

const PREVIEW: DemoPackagePreview = {
    draft: { name: 'Bodea', description: 'Bodea-branded B2B demo' },
    checks: [{ id: 'repository', ok: true, message: 'steve/kukla-bodea is public.' }],
    link: 'https://github.com/steve/kukla-bodea',
    saved: false,
    onList: false,
    templateFlagSet: false,
};

function fakeServer() {
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {
        registerTool(name: string, _def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
        },
        async call(name: string, args: unknown): Promise<any> {
            return JSON.parse((await tools.get(name)!(args)).content[0].text);
        },
    };
}

const ctx = createMockHandlerContext({
    stateManager: createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(
            createMockProject({ demoPackage: { fileSha: 'blob-1', templateFlagSet: true, savedAt: '2026-09-12T00:00:00.000Z' } }),
        ),
    }),
});

function server() {
    const s = fakeServer();
    registerDemoPackageTools(s, () => ctx);
    return s;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRequireGitHub.mockResolvedValue(undefined);
    mockPreview.mockResolvedValue({ success: true, data: PREVIEW });
    mockSave.mockResolvedValue({
        success: true,
        data: { link: PREVIEW.link, file: 'written', onList: true, templateFlagSet: false, checks: PREVIEW.checks },
    });
    mockRemove.mockResolvedValue({ success: true, data: { file: 'removed', templateFlagUnset: true, removedFromList: true } });
});

describe('get_demo_package_preview', () => {
    it('answers the preview as the handler shaped it, and the GitHub refusal first', async () => {
        expect(await server().call('get_demo_package_preview', {})).toEqual(PREVIEW);

        mockRequireGitHub.mockResolvedValue({ error: 'Sign in to GitHub first.', needsAuth: 'github' });
        expect(await server().call('get_demo_package_preview', {})).toMatchObject({ needsAuth: 'github' });
        expect(mockPreview).toHaveBeenCalledTimes(1);
    });

    it("passes the handler's refusal through (a headless project, say)", async () => {
        mockPreview.mockResolvedValue({ success: false, error: 'Only an Edge Delivery project can become a demo package from here.' });
        expect(await server().call('get_demo_package_preview', {})).toEqual({
            error: 'Only an Edge Delivery project can become a demo package from here.',
        });
    });
});

describe('save_demo_package', () => {
    it('refuses without confirm, naming the file, the name it would carry, the repository and the list, and writes nothing', async () => {
        const refusal = await server().call('save_demo_package', { markTemplate: true });
        expect(refusal.error).toBe(
            'save_demo_package would write demo.demo-builder.json named "Bodea" into https://github.com/steve/kukla-bodea, put the card on your Add a demo list, and mark the repository as a template. Call again with confirm:true to do it.',
        );
        expect(refusal).toMatchObject({ name: 'Bodea', description: 'Bodea-branded B2B demo', alreadySaved: false, alreadyOnList: false });
        expect(mockSave).not.toHaveBeenCalled();
    });

    it('hands the handler the given name and description, the prefilled ones when absent, and the template choice', async () => {
        const result = await server().call('save_demo_package', { name: ' Bodea by Steve ', confirm: true });
        expect(mockSave).toHaveBeenCalledWith(ctx, { name: 'Bodea by Steve', description: 'Bodea-branded B2B demo', markTemplate: false });
        expect(result).toMatchObject({ link: PREVIEW.link, file: 'written', onList: true, hint: expect.stringContaining('Add a demo') });
    });

    it("passes the handler's failure through", async () => {
        mockSave.mockResolvedValue({ success: false, error: 'GitHub refused the write.' });
        expect(await server().call('save_demo_package', { confirm: true })).toEqual({ error: 'GitHub refused the write.' });
    });
});

describe('remove_demo_package', () => {
    it('refuses without confirm, saying what is removed and when it was saved, and removes nothing', async () => {
        const refusal = await server().call('remove_demo_package', {});
        expect(refusal).toMatchObject({ destructive: true, savedAt: '2026-09-12T00:00:00.000Z', templateFlagSet: true });
        expect(refusal.error).toMatch(/takes the description file out of your storefront repository and the card off your Add a demo list/);
        expect(mockRemove).not.toHaveBeenCalled();
    });

    it('runs the handler with confirm and answers what it undid', async () => {
        expect(await server().call('remove_demo_package', { confirm: true })).toEqual({ file: 'removed', templateFlagUnset: true, removedFromList: true });
        expect(mockRemove).toHaveBeenCalledWith(ctx, undefined);
    });
});
