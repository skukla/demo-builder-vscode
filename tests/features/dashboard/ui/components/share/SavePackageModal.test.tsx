/**
 * Save as Package (owner, 2026-11-18, EDS-72 decision 4): the project dashboard's door to a card on
 * the SC's own Welcome step, to build new projects from. It moved out of Share Demo, whose link step
 * had an "Add to My Welcome Step" box (owner: Share Demo is not the place for it).
 *
 * A Steps window: the storefront is read behind the house wait, then Name and Description,
 * prefilled as the link step prefills them, and Save as Package beside Close. Once saved, or once it
 * failed, the window is the house result. A project already on the Welcome step offers Remove
 * Package, the link step's undo moved here, whose outcome is a result too.
 */

import { fireEvent, screen, within } from '@testing-library/react';
import {
    answer,
    button,
    click,
    mockRequest,
    nameInput,
    PREVIEW,
    REMOVED,
    renderSavePackage,
    renderSavePackagePending,
    resetShareMocks,
    SAVED,
    sent,
} from './ShareModal.testUtils';

const SAVE = 'Save as Package';
const REMOVE = 'Remove Package';
const ON_LIST = answer({ ...PREVIEW, saved: true, onList: true });

const footer = (): HTMLElement => document.querySelector('.modal-footer-actions') as HTMLElement;
const footerLabels = (): Array<string | null> =>
    within(footer())
        .getAllByRole('button')
        .map((b) => b.textContent);

describe('SavePackageModal', () => {
    beforeEach(resetShareMocks);

    it('reads the storefront behind the house wait, showing no form until it answers', () => {
        renderSavePackagePending();
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.queryByTestId('share-name')).not.toBeInTheDocument();
        expect(mockRequest).toHaveBeenCalledWith('getDemoPackagePreview');
    });

    it('opens under its title with Name and Description prefilled, and Close and Save as Package', async () => {
        await renderSavePackage();
        expect(screen.getByRole('heading', { name: SAVE })).toBeInTheDocument();
        expect(nameInput().value).toBe('Bodea');
        expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue('Bodea-branded B2B demo');
        expect(footerLabels()).toEqual(['Close', SAVE]);
        // Nothing to remove before the project is on the Welcome step.
        expect(screen.queryByRole('button', { name: REMOVE })).not.toBeInTheDocument();
        // Positive control first, then no middle dot anywhere in the window.
        expect(screen.getByRole('dialog')).toHaveTextContent('Name');
        expect(screen.getByRole('dialog').textContent).not.toContain('·');
    });

    it('needs a name: an empty one disables Save as Package', async () => {
        await renderSavePackage();
        fireEvent.change(nameInput(), { target: { value: '   ' } });
        expect(button(SAVE)).toHaveAttribute('aria-disabled', 'true');
    });

    it('saves with the card on the Welcome step, then shows Package Saved with only Close', async () => {
        await renderSavePackage();
        fireEvent.change(nameInput(), { target: { value: ' Bodea by Steve ' } });
        mockRequest.mockResolvedValueOnce(answer(SAVED));

        await click(SAVE);

        expect(sent('saveDemoPackage')).toEqual([
            ['saveDemoPackage', { name: 'Bodea by Steve', description: 'Bodea-branded B2B demo', addToWelcome: true }],
        ]);
        const result = screen.getByTestId('result-body');
        expect(result).toHaveTextContent('Package Saved');
        expect(result).toHaveTextContent('Bodea by Steve is on your Welcome step.');
        expect(screen.queryByTestId('share-name')).not.toBeInTheDocument();
        expect(footerLabels()).toEqual(['Close']);
        // A success is a small window of its own (owner, 2026-11-20).
        expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'S');
    });

    // Walk F244: a package file that is not ours is kept, and the result says so in a second line.
    it('says when a package file it did not create was left unchanged', async () => {
        await renderSavePackage();
        mockRequest.mockResolvedValueOnce(answer({ ...SAVED, file: 'skipped', fileReason: 'not ours' }));

        await click(SAVE);

        const result = screen.getByTestId('result-body');
        expect(result).toHaveTextContent('Package Saved');
        expect(result).toHaveTextContent("The package file in your repository wasn't created by Demo Builder, so it was left unchanged.");
        expect(result).not.toHaveTextContent('not ours');
    });

    it("shows a failed save as Couldn't Save the Package with the reason, and Try Again saves again", async () => {
        await renderSavePackage();
        mockRequest.mockResolvedValueOnce({ success: false, error: 'GitHub refused the write.' });

        await click(SAVE);

        const result = screen.getByTestId('result-body');
        expect(result).toHaveTextContent("Couldn't Save the Package");
        expect(result).toHaveTextContent('GitHub refused the write.');
        expect(footerLabels()).toEqual(['Close', 'Try Again']);
        expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'L');

        mockRequest.mockResolvedValueOnce(answer(SAVED));
        await click('Try Again');
        expect(sent('saveDemoPackage')).toHaveLength(2);
        expect(screen.getByTestId('result-body')).toHaveTextContent('Package Saved');
    });

    it('offers Remove Package as a quiet link for a project already on the Welcome step', async () => {
        await renderSavePackage(ON_LIST);
        const remove = button(REMOVE);
        expect(remove).toHaveClass('inline-action-link');
        expect(within(footer()).queryByRole('button', { name: REMOVE })).toBeNull();
    });

    it('Remove Package takes the card and the file away, and says so as a result', async () => {
        await renderSavePackage(ON_LIST);
        mockRequest.mockResolvedValueOnce(answer(REMOVED));

        await click(REMOVE);

        expect(mockRequest).toHaveBeenLastCalledWith('removeDemoPackage');
        const result = screen.getByTestId('result-body');
        expect(result).toHaveTextContent('Package Removed');
        // Walk F244 (owner): plain application words for what happened to the file and the card.
        expect(result).toHaveTextContent('The package file was removed from your repository and the card was removed from your Welcome step.');
        expect(footerLabels()).toEqual(['Close']);
    });

    it("shows a failed removal as Couldn't Remove the Package, and Try Again removes again", async () => {
        await renderSavePackage(ON_LIST);
        mockRequest.mockResolvedValueOnce({ success: false, error: 'GitHub refused the delete.' });

        await click(REMOVE);

        const result = screen.getByTestId('result-body');
        expect(result).toHaveTextContent("Couldn't Remove the Package");
        expect(result).toHaveTextContent('GitHub refused the delete.');
        mockRequest.mockResolvedValueOnce(answer({ file: 'skipped', removedFromList: true }));
        await click('Try Again');
        expect(sent('removeDemoPackage')).toHaveLength(2);
        expect(screen.getByTestId('result-body')).toHaveTextContent('Package Removed');
    });

    it("says why when the storefront could not be read, and offers no save", async () => {
        await renderSavePackage({ success: false, error: 'Sign In to GitHub First.' });
        expect(screen.getByTestId('share-link-failed')).toHaveTextContent(
            "Couldn't read the storefront. Sign In to GitHub First.",
        );
        expect(footerLabels()).toEqual(['Close']);
    });

    it('closes from Close', async () => {
        const { onClose } = await renderSavePackage();
        await click('Close');
        expect(onClose).toHaveBeenCalled();
    });
});
