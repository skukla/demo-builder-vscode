/**
 * Putting Demo Builder's storefront pieces back after (or before) an update.
 *
 * The product-page overlay's address is not in the demo package: both resets work it out
 * from the user's `demoBuilder.byom.*` settings (`resolveByomOverlayConfig`). The update path
 * skipped that step, so it always saw the overlay as off: it never wrote the first-visit
 * script into 404.html, and so never took Demo Builder's old copy out of delayed.js. Live on
 * JustRite (2026-10-30): "BYOM disabled (no overlayUrl) — skipping smart 404 install", then
 * the Adobe boilerplate update failed again on "patch failed: scripts/delayed.js:1".
 */

import { restoreDemoBuilderPieces } from '@/features/updates/services/thinLayerUpdate';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';

const mockBringUpToDate = jest.fn();
jest.mock('@/features/eds/services/storefront/storefrontUpToDate', () => ({
    bringStorefrontUpToDate: (...a: unknown[]) => mockBringUpToDate(...a),
}));
jest.mock('@/features/eds/services/quickEditPublisher', () => ({ installQuickEdit: jest.fn(async () => undefined) }));
const mockExtract = jest.fn();
jest.mock('@/features/eds/services/reset/edsResetParams', () => ({
    ...jest.requireActual('@/features/eds/services/reset/edsResetParams'),
    extractResetParams: (...a: unknown[]) => mockExtract(...a),
}));

const project = { name: 'justrite' } as Project;
const fileOps = {} as Parameters<typeof restoreDemoBuilderPieces>[1];
const OVERLAY = 'https://overlay.test/render-pdp?org=kukla&site=kukla-justrite';

beforeEach(() => {
    jest.clearAllMocks();
    mockExtract.mockReturnValue({
        success: true,
        params: { repoOwner: 'skukla', repoName: 'kukla-justrite', daLiveOrg: 'kukla', daLiveSite: 'kukla-justrite' },
    });
    mockBringUpToDate.mockResolvedValue({ smart404: { installed: true }, current: true });
});

describe('restoreDemoBuilderPieces', () => {
    it("asks the overlay resolver for the storefront's overlay, as a reset does, and hands its answer on", async () => {
        const resolve = jest.fn(() => OVERLAY);

        await restoreDemoBuilderPieces(project, fileOps, createMockLogger(), resolve);

        expect(resolve).toHaveBeenCalledWith(undefined, 'kukla', 'kukla-justrite');
        expect(mockBringUpToDate).toHaveBeenCalledWith(fileOps, 'skukla', 'kukla-justrite', OVERLAY, expect.anything(), 'kukla', 'kukla-justrite');
    });

    it('with no resolver, uses what the project row names (outside VS Code, as the patch canary runs)', async () => {
        await restoreDemoBuilderPieces(project, fileOps, createMockLogger());

        expect(mockBringUpToDate).toHaveBeenCalledWith(fileOps, 'skukla', 'kukla-justrite', undefined, expect.anything(), 'kukla', 'kukla-justrite');
    });
});
