/**
 * The target scope an import or reset ends up sending.
 *
 * The MCP rows leave `websiteCode`/`storeCode` optional, so an agent that skips
 * `list_datapack_import_scopes` sends neither — and the service then applies its
 * own `base`/`default`, writing into a scope nobody chose. The modal was fixed
 * by seeding its pickers from the project; the agent surface has no pickers, so
 * the fallback belongs in the handler, where both paths pass through.
 *
 * Two rules, and the second is what keeps the first honest:
 *   - **Omitted means the project's scope**, not the service's default.
 *   - **Explicit beats recorded.** A caller that names a scope means it, and a
 *     HALF-named one is refused rather than completed — filling in the other
 *     half would silently change what the call asked for.
 *
 * Split from `importHandlers.test.ts` when that file crossed the 500-line cap;
 * the shared preamble lives in `importHandlers.testUtils.ts`.
 */

import {
    happyClient,
    importHandlers,
    makeContext,
    PAAS_PROJECT,
    PAYLOAD,
    resetImportHandlerMocks,
} from './importHandlers.testUtils';
import type { Project } from '@/types/base';

/** The same PaaS project, with a Business Structure recorded. */
const SCOPED_PAAS_PROJECT: Partial<Project> = {
    ...PAAS_PROJECT,
    componentConfigs: {
        'adobe-commerce-paas': {
            ...PAAS_PROJECT.componentConfigs!['adobe-commerce-paas'],
            ADOBE_COMMERCE_WEBSITE_CODE: 'bodea',
            ADOBE_COMMERCE_STORE_VIEW_CODE: 'bodea_us',
        },
    },
};

beforeEach(() => {
    resetImportHandlerMocks();
});

describe('the scope an omitted payload falls back to', () => {
    it('uses the project scope when the caller sends none', async () => {
        const { startImport } = happyClient();
        const { context } = makeContext(SCOPED_PAAS_PROJECT);

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(startImport).toHaveBeenCalledWith(
            expect.objectContaining({
                target: { websiteCode: 'bodea', storeCode: 'bodea_us' },
            }),
        );
    });

    it('lets an explicit scope win over the recorded one', async () => {
        const { startImport } = happyClient();
        const { context } = makeContext(SCOPED_PAAS_PROJECT);

        await importHandlers['start-datapack-import'](context, {
            ...PAYLOAD,
            websiteCode: 'base',
            storeCode: 'default',
        });

        expect(startImport).toHaveBeenCalledWith(
            expect.objectContaining({ target: { websiteCode: 'base', storeCode: 'default' } }),
        );
    });

    it('sends no target when neither the caller nor the project has one', async () => {
        const { startImport } = happyClient();
        const { context } = makeContext(PAAS_PROJECT);

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        // Unchanged: the service applies its own default, which is right for a
        // project that genuinely records no scope.
        expect(startImport).toHaveBeenCalledWith(expect.objectContaining({ target: undefined }));
    });

    it('applies the same fallback to a reset', async () => {
        const { startDelete } = happyClient();
        const { context } = makeContext(SCOPED_PAAS_PROJECT);

        await importHandlers['reset-datapack'](context, { ...PAYLOAD, confirm: true });

        // The divergence this closes: a reset used to target whatever the caller
        // happened to send, which for an agent was nothing at all.
        expect(startDelete).toHaveBeenCalledWith(
            expect.objectContaining({
                target: { websiteCode: 'bodea', storeCode: 'bodea_us' },
            }),
        );
    });

    it('still refuses half a pair rather than completing it', async () => {
        const { startImport } = happyClient();
        const { context } = makeContext(SCOPED_PAAS_PROJECT);

        const result = await importHandlers['start-datapack-import'](context, {
            ...PAYLOAD,
            websiteCode: 'bodea',
        });

        expect(result.success).toBe(false);
        expect(startImport).not.toHaveBeenCalled();
    });
});
