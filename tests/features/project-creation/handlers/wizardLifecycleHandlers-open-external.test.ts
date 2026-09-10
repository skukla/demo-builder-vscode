/**
 * Lifecycle Handlers Tests - openExternal happy paths
 *
 * The sibling suite (wizardLifecycleHandlers.test.ts) covers the REJECTIONS —
 * every URL that validateURL refuses. Nothing covered what happens when a URL is
 * accepted, so the whole tail of handleOpenExternal (the openUrl call, its
 * arguments, the success result and the failure result) was unconstrained.
 *
 * validateURL is deliberately NOT mocked here: the data-URL branch exists to SKIP
 * validation, and a mocked validator cannot show that it was skipped.
 */

import { handleOpenExternal } from '@/features/project-creation/handlers/wizardLifecycleHandlers';
import { openUrl } from '@/core/utils/browserUtils';
import { createWizardLifecycleContext } from './wizardLifecycleHandlers.testUtils';

jest.mock('@/core/utils/browserUtils', () => ({
    openUrl: jest.fn().mockResolvedValue(undefined),
}));

const mockOpenUrl = openUrl as jest.MockedFunction<typeof openUrl>;

describe('lifecycleHandlers - handleOpenExternal (accepted URLs)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockOpenUrl.mockResolvedValue(undefined);
    });

    it('opens an accepted https URL under the setup temp filename', async () => {
        const context = createWizardLifecycleContext();

        const result = await handleOpenExternal(context, { url: 'https://example.com/setup' });

        expect(mockOpenUrl).toHaveBeenCalledWith(
            'https://example.com/setup',
            'demo-builder-setup.html'
        );
        expect(result).toEqual({ success: true });
    });

    it('opens a data: URL WITHOUT running it through validateURL', async () => {
        // A data: URL cannot pass validateURL (its protocol is not https), so if the
        // handler validated it the call would be refused before openUrl was reached.
        const dataUrl = 'data:text/html;charset=utf-8,%3Ch1%3Ehello%3C%2Fh1%3E';
        const context = createWizardLifecycleContext();

        const result = await handleOpenExternal(context, { url: dataUrl });

        expect(mockOpenUrl).toHaveBeenCalledWith(dataUrl, 'demo-builder-setup.html');
        expect(result).toEqual({ success: true });
    });

    it('returns the failure from openUrl rather than throwing', async () => {
        mockOpenUrl.mockRejectedValue(new Error('no browser available'));
        const context = createWizardLifecycleContext();

        const result = await handleOpenExternal(context, { url: 'https://example.com/setup' });

        expect(result).toEqual({ success: false, error: 'no browser available' });
    });
});
