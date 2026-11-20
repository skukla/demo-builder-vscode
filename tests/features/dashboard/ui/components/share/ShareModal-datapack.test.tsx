/**
 * Share Demo's datapack notice comes with its fix (owner, 2026-11-18, walk F229): a pack only the
 * SC can see stops colleagues using the demo's data, so the notice offers Share Datapack. It asks
 * first, as the Datapacks screen's Share does ("Share <name>?" with the same line), then shares
 * with that screen's own request; the button is busy while it runs, and the storefront is read
 * again afterwards so the notice goes once the check passes. A failure is the notice's line.
 */

import { fireEvent, screen, within } from '@testing-library/react';
import {
    answer,
    button,
    click,
    mockRequest,
    nameInput,
    PREVIEW,
    PRIVATE_PACK,
    renderShareLink,
    resetShareMocks,
    sent,
} from './ShareModal.testUtils';
import { settle } from '../../../../../helpers/reactSettle';
import { SHARE_CONSENT } from '@/features/data-installer/shareWording';
import type { DemoPackageCheck, DemoPackagePreview } from '@/types/webviewRequests';

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

const notice = (): HTMLElement => screen.getByTestId('package-check-datapack');
const shareButton = (): HTMLElement =>
    within(notice()).getByRole('button', { name: 'Share Datapack' });

async function pressShareDatapack(): Promise<void> {
    fireEvent.click(shareButton());
    await settle();
}

beforeEach(resetShareMocks);

describe('ShareModal: the datapack notice and its fix', () => {
    it('offers Share Datapack in the notice for a pack only the SC can see', async () => {
        await renderShareLink(answer(WITH_PRIVATE_PACK));
        expect(shareButton()).toBeInTheDocument();
    });

    it('offers no fix on a check that carries none', async () => {
        const missing: DemoPackageCheck = {
            id: 'datapack',
            ok: false,
            message: "The sample data this demo uses isn't available to colleagues yet.",
        };
        await renderShareLink(answer({ ...PREVIEW, checks: [missing] }));
        expect(within(notice()).queryByRole('button')).not.toBeInTheDocument();
    });

    it("asks first, as the Datapacks screen's Share does, and sends nothing until asked", async () => {
        await renderShareLink(answer(WITH_PRIVATE_PACK));
        await pressShareDatapack();

        expect(
            screen.getByRole('heading', { name: 'Share Release Save Test 2?' })
        ).toBeInTheDocument();
        expect(screen.getByText(SHARE_CONSENT)).toBeInTheDocument();
        expect(button('Share')).toBeInTheDocument();
        expect(sent('share-library-datapack')).toHaveLength(0);
    });

    it('Cancel goes back to the form with nothing shared and what the SC typed kept', async () => {
        await renderShareLink(answer(WITH_PRIVATE_PACK));
        fireEvent.change(nameInput(), { target: { value: 'Bodea by Steve' } });
        await pressShareDatapack();

        await click('Cancel');

        expect(sent('share-library-datapack')).toHaveLength(0);
        expect(shareButton()).toBeInTheDocument();
        expect(nameInput().value).toBe('Bodea by Steve');
    });

    it("shares with the library's own request, busy while it runs, then reads again and the notice goes", async () => {
        await renderShareLink(answer(WITH_PRIVATE_PACK));
        fireEvent.change(nameInput(), { target: { value: 'Bodea by Steve' } });
        await pressShareDatapack();
        let finish: (value: unknown) => void = () => undefined;
        mockRequest.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));

        await click('Share');

        expect(sent('share-library-datapack').map((call) => call.slice(0, 2))).toEqual([
            ['share-library-datapack', { datapackName: 'release-save-test-2', shared: true, confirm: true }],
        ]);
        expect(shareButton()).toHaveAttribute('aria-busy', 'true');
        // Walk F237: the house busy face, a spinner that shows on the quiet button, not Spectrum's grey one.
        expect(shareButton().querySelector('.modal-button-pending')).not.toBeNull();

        mockRequest.mockResolvedValueOnce(answer(AFTER_SHARE));
        finish({
            success: true,
            data: { datapackName: 'release-save-test-2', shared: true, versions: 1 },
        });
        await settle();

        expect(sent('getDemoPackagePreview')).toHaveLength(2);
        expect(screen.queryByTestId('package-check-datapack')).not.toBeInTheDocument();
        expect(screen.getByTestId('package-check-datapack-shared')).toHaveTextContent('Datapack Shared');
        expect(nameInput().value).toBe('Bodea by Steve');
    });

    // Walk F237 (owner: no success message, the spinner stayed): the share's own answer says it is
    // shared, so the notice turns green at once; the read again that follows keeps the other checks
    // fresh but never holds the button or brings the amber notice back.
    it('says it is shared as soon as the share answers, whatever the read again does', async () => {
        await renderShareLink(answer(WITH_PRIVATE_PACK));
        await pressShareDatapack();
        mockRequest.mockResolvedValueOnce({ success: true, data: { datapackName: 'release-save-test-2', shared: true, versions: 1 } });
        // The read again answers late, and with the library not yet saying shared.
        let finishRead: (value: unknown) => void = () => undefined;
        mockRequest.mockReturnValueOnce(new Promise((resolve) => (finishRead = resolve)));

        await click('Share');

        const shared = screen.getByTestId('package-check-datapack-shared');
        expect(shared).toHaveClass('inline-notice--success');
        expect(shared).toHaveTextContent('Datapack Shared');
        expect(shared).toHaveTextContent('Colleagues can use Release Save Test 2 now.');
        expect(screen.queryByTestId('package-check-datapack')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Share Datapack' })).not.toBeInTheDocument();

        finishRead(answer(WITH_PRIVATE_PACK));
        await settle();
        expect(screen.queryByTestId('package-check-datapack')).not.toBeInTheDocument();
        expect(screen.getByTestId('package-check-datapack-shared')).toBeInTheDocument();
    });

    it('a failure is the notice line, and the button can be pressed again', async () => {
        await renderShareLink(answer(WITH_PRIVATE_PACK));
        await pressShareDatapack();
        mockRequest.mockResolvedValueOnce({ success: false, error: 'Adobe sign-in is required.' });

        await click('Share');

        expect(notice()).toHaveTextContent('Adobe sign-in is required.');
        expect(notice()).not.toHaveTextContent('Release Save Test 2 is only visible to you.');
        expect(shareButton()).not.toHaveAttribute('aria-busy');
        expect(sent('getDemoPackagePreview')).toHaveLength(1);
    });
});
