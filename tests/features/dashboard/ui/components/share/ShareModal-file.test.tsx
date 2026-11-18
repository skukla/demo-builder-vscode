/**
 * Share Demo's file step, fixed the way the link step was (owner, 2026-11-18, walk F230):
 *
 * - the two parts are house checkbox rows, each with its line as the row's quieter detail, under
 *   the "What to Include" label;
 * - Save File holds only its own width, not the link step's longest label;
 * - a datapack only the SC can see is the link step's amber notice with Share Datapack, at the top
 *   of the file step, read from the same checks (the storefront preview for an Edge Delivery
 *   project, the datapack check alone for a headless one). The save asks nothing more: the old
 *   VS Code pop-up never stopped a save, and the notice says it before Save File is pressed.
 */

import { fireEvent, screen, within } from '@testing-library/react';
import {
    answer,
    button,
    click,
    mockRequest,
    partBox,
    PREVIEW,
    PRIVATE_PACK,
    renderShareFile,
    resetShareMocks,
    sent,
} from './ShareModal.testUtils';
import { settle } from '../../../../../helpers/reactSettle';
import type {
    DemoPackageCheck,
    DemoPackagePreview,
    ShareDatapackChecks,
} from '@/types/webviewRequests';

const WITH_PRIVATE_PACK: DemoPackagePreview = {
    ...PREVIEW,
    checks: [...PREVIEW.checks, PRIVATE_PACK],
};
const SHARED_PACK: DemoPackageCheck = {
    id: 'datapack',
    ok: true,
    message: 'Colleagues can install the same sample data (Release Save Test 2).',
};
const AFTER_SHARE: DemoPackagePreview = { ...PREVIEW, checks: [...PREVIEW.checks, SHARED_PACK] };

const footer = (): HTMLElement => document.querySelector('.modal-footer-actions') as HTMLElement;
const form = (): HTMLElement => screen.getByTestId('export-file-form');
const notice = (): HTMLElement => screen.getByTestId('package-check-datapack');
const shareButton = (): HTMLElement =>
    within(notice()).getByRole('button', { name: 'Share Datapack' });

beforeEach(resetShareMocks);

describe('ShareModal: the file step', () => {
    describe('what to include', () => {
        it('puts the two parts under the section label as house checkbox rows, each with its line', async () => {
            await renderShareFile();

            expect(within(form()).getByText('What to Include')).toHaveClass('section-label');
            const rows = form().querySelectorAll('.checkbox-row');
            expect(rows).toHaveLength(2);
            expect(rows[0]).toHaveTextContent('Setup');
            expect(rows[0].querySelector('.checkbox-row-help')).toHaveTextContent(
                'Your Commerce, Adobe, GitHub and DA.live settings. Never a credential.'
            );
            expect(rows[1]).toHaveTextContent('Storefront');
            expect(rows[1].querySelector('.checkbox-row-help')).toHaveTextContent(
                "The storefront's code and content site."
            );
        });

        it("says on the storefront's row that a headless project has none, and locks it off", async () => {
            await renderShareFile({ isEds: false });

            const storefront = form().querySelectorAll('.checkbox-row')[1];
            expect(storefront.querySelector('.checkbox-row-help')).toHaveTextContent(
                'This project has no storefront of its own.'
            );
            expect(partBox('Storefront').disabled).toBe(true);
        });

        it('disables Save File when nothing is ticked, as before', async () => {
            await renderShareFile();
            fireEvent.click(partBox('Setup'));
            fireEvent.click(partBox('Storefront'));

            expect(button('Save File')).toHaveAttribute('aria-disabled', 'true');
        });
    });

    it("holds Save File at its own width, never the link step's longest label", async () => {
        await renderShareFile();
        const sizers = Array.from(footer().querySelectorAll('.modal-button-sizer')).map(
            (s) => s.textContent
        );

        expect(sizers).not.toContain('Save and Copy Link');
        expect(sizers).not.toContain('Copy Link');
    });

    describe('a datapack only the SC can see', () => {
        it("shows the link step's notice with Share Datapack at the top, and only the datapack's", async () => {
            await renderShareFile({}, answer(WITH_PRIVATE_PACK));

            expect(notice()).toHaveTextContent("Colleagues Can't Use This Demo's Data Yet");
            expect(notice()).toHaveTextContent('Release Save Test 2 is only visible to you.');
            expect(shareButton()).toBeInTheDocument();
            // The notice comes before the parts.
            expect(form().firstElementChild).toBe(notice());
            // A file carries the storefront's code, so the repository and index checks are the link's.
            expect(screen.queryByTestId('package-check-index')).not.toBeInTheDocument();
        });

        it('shows nothing when the pack needs nothing', async () => {
            await renderShareFile({}, answer(AFTER_SHARE));

            expect(screen.queryByTestId('package-check-datapack')).not.toBeInTheDocument();
            expect(within(form()).getByText('What to Include')).toBeInTheDocument();
        });

        it('shares from the file step, reads again, and the notice goes with the ticks kept', async () => {
            await renderShareFile({}, answer(WITH_PRIVATE_PACK));
            fireEvent.click(partBox('Storefront'));
            fireEvent.click(shareButton());
            await settle();
            expect(
                screen.getByRole('heading', { name: 'Share Release Save Test 2?' })
            ).toBeInTheDocument();
            mockRequest.mockResolvedValueOnce(
                answer({ datapackName: 'release-save-test-2', shared: true, versions: 1 })
            );
            mockRequest.mockResolvedValueOnce(answer(AFTER_SHARE));

            await click('Share');

            expect(sent('share-library-datapack').map((call) => call.slice(0, 2))).toEqual([
                [
                    'share-library-datapack',
                    { datapackName: 'release-save-test-2', shared: true, confirm: true },
                ],
            ]);
            expect(sent('getDemoPackagePreview')).toHaveLength(2);
            expect(screen.queryByTestId('package-check-datapack')).not.toBeInTheDocument();
            expect(partBox('Storefront').checked).toBe(false);
        });

        it("a headless project's check comes from its own datapack read, and is shared the same way", async () => {
            await renderShareFile(
                { isEds: false },
                undefined,
                answer<ShareDatapackChecks>({ checks: [PRIVATE_PACK] })
            );

            expect(sent('getDemoPackagePreview')).toHaveLength(0);
            expect(shareButton()).toBeInTheDocument();
            fireEvent.click(shareButton());
            await settle();
            mockRequest.mockResolvedValueOnce(
                answer({ datapackName: 'release-save-test-2', shared: true, versions: 1 })
            );
            mockRequest.mockResolvedValueOnce(
                answer<ShareDatapackChecks>({ checks: [SHARED_PACK] })
            );

            await click('Share');

            expect(sent('getShareDatapackCheck')).toHaveLength(2);
            expect(screen.queryByTestId('package-check-datapack')).not.toBeInTheDocument();
        });

        it('a datapack read that fails shows no notice, and the file still saves', async () => {
            await renderShareFile({ isEds: false }, undefined, {
                success: false,
                error: 'Adobe sign-in is required.',
            });

            expect(screen.queryByTestId('package-check-datapack')).not.toBeInTheDocument();
            expect(button('Save File')).not.toHaveAttribute('aria-disabled', 'true');
        });

        it('Save File saves at once with the notice up: no second question', async () => {
            await renderShareFile({}, answer(WITH_PRIVATE_PACK));
            mockRequest.mockResolvedValueOnce(
                answer({
                    path: '/p/bodea-demo-bundle.zip',
                    fileCount: 2,
                    parts: ['setup', 'storefront'],
                })
            );

            await click('Save File');

            expect(sent('exportDemoBundle')).toEqual([
                ['exportDemoBundle', { setup: true, storefront: true }],
            ]);
            expect(screen.getByTestId('export-saved')).toBeInTheDocument();
        });
    });
});
