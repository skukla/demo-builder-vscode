/**
 * "Save as demo package": its own dialog. Reads once on open, prefills from the
 * project, lists the checks, and commits at Save and Remove only.
 */

import { act, fireEvent, screen } from '@testing-library/react';
import { answer, button, click, LINK, mockRequest, nameInput, PREVIEW, REMOVED, renderPackage, renderPackagePending, resetPackageMocks, SAVED } from './DemoPackageModal.testUtils';

describe('DemoPackageModal', () => {
    beforeEach(resetPackageMocks);

    it('opens under its own title, reads the preview, says what becomes of the storefront, prefills the name, and lists the checks', async () => {
        await renderPackage();
        expect(screen.getByRole('heading', { name: 'Save as demo package' })).toBeInTheDocument();
        expect(mockRequest).toHaveBeenCalledWith('getDemoPackagePreview');
        expect(screen.getByText(/Puts this storefront on your Welcome step as a card/)).toBeInTheDocument();
        expect(nameInput().value).toBe('Bodea');
        expect(screen.getByTestId('package-check-index')).toHaveTextContent('Republish, then save again.');
        // Owner, 2026-09-14: no help under the name field, and no template tick box.
        expect(screen.queryByText('What the card says on the Welcome step.')).not.toBeInTheDocument();
        expect(screen.queryByText(/mark the repository as a template/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Remove demo package' })).not.toBeInTheDocument();
    });

    it('while looking at the storefront, the spinner is the whole body — no intro, no form', async () => {
        // Owner, 2026-09-14: the loading state carries nothing but the spinner
        // and its own two lines. The intro arrives with the form it introduces.
        renderPackagePending();

        expect(screen.getByText('Looking at your storefront')).toBeInTheDocument();
        expect(screen.queryByText(/Puts this storefront on your Welcome step as a card/)).not.toBeInTheDocument();
        expect(screen.queryByTestId('package-name')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    });

    it('shows the refusal when the storefront cannot become a demo package', async () => {
        await renderPackage({ success: false, error: 'Only an Edge Delivery project can become a demo package from here.' });
        expect(screen.getByText("This storefront can't become a demo package")).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    });

    it('sends the edited name and the description at Save, then shows the house success state with the link', async () => {
        await renderPackage();
        fireEvent.change(nameInput(), { target: { value: ' Bodea by Steve ' } });
        mockRequest.mockResolvedValueOnce(answer(SAVED));

        await click('Save');

        expect(mockRequest).toHaveBeenLastCalledWith('saveDemoPackage', { name: 'Bodea by Steve', description: 'Bodea-branded B2B demo' });
        // Owner, 2026-09-14: the result is the success state every other flow
        // uses, not a notice squeezed under the form.
        const saved = screen.getByTestId('package-saved');
        expect(saved).toHaveTextContent('Saved as a demo package');
        expect(saved).toHaveTextContent(`It's on your Welcome step. Colleagues paste this link into "Add a demo package".`);
        expect(saved).toHaveTextContent(LINK);
        expect(screen.queryByTestId('package-name')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Update' })).not.toBeInTheDocument();
    });

    it('while saving, the spinner is the whole body', async () => {
        await renderPackage();
        mockRequest.mockReturnValueOnce(new Promise(() => undefined));

        await click('Save');

        expect(screen.getByText('Saving the demo package')).toBeInTheDocument();
        expect(screen.queryByTestId('package-name')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    });

    it('puts Save and Remove in the dialog footer beside Close, like every other dialog', async () => {
        await renderPackage(answer({ ...PREVIEW, saved: true }));

        const footer = button('Close').parentElement as HTMLElement;
        expect(footer).toContainElement(button('Update'));
        expect(footer).toContainElement(button('Remove demo package'));
        // A saved package, reopened: the link is there to copy before anything is pressed.
        expect(screen.getByTestId('package-link')).toHaveTextContent(LINK);
    });

    it('disables Save while the name is empty', async () => {
        await renderPackage();
        fireEvent.change(nameInput(), { target: { value: '   ' } });
        // A footer action: the Modal marks it the way the Add a demo package footer does.
        expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
    });

    it('says when the file in the repository was not ours and was left alone, and that the card is saved anyway', async () => {
        await renderPackage();
        mockRequest.mockResolvedValueOnce(answer({ ...SAVED, file: 'skipped', fileReason: 'demo.demo-builder.json is already there and was not written by Demo Builder, or was edited since.' }));
        await click('Save');
        expect(screen.getByTestId('package-skipped')).toHaveTextContent('Card saved; the file in your repository was left alone');
        expect(screen.queryByTestId('package-saved')).not.toBeInTheDocument();
    });

    it('offers Remove for a saved package (or a card already on the list) and reports what it undid', async () => {
        await renderPackage(answer({ ...PREVIEW, saved: false, onList: true }));
        mockRequest.mockResolvedValueOnce(answer(REMOVED));

        await click('Remove demo package');

        expect(mockRequest).toHaveBeenLastCalledWith('removeDemoPackage');
        expect(screen.getByTestId('package-removed')).toHaveTextContent('Demo package removed');
        expect(screen.getByTestId('package-removed')).toHaveTextContent('The card is off your Welcome step and the file is out of your repository.');
        expect(screen.queryByTestId('package-name')).not.toBeInTheDocument();
    });

    it('while removing, the spinner is the whole body', async () => {
        await renderPackage(answer({ ...PREVIEW, saved: true }));
        mockRequest.mockReturnValueOnce(new Promise(() => undefined));

        await act(async () => {
            fireEvent.click(button('Remove demo package'));
        });

        expect(screen.getByText('Removing the demo package')).toBeInTheDocument();
        expect(screen.queryByTestId('package-name')).not.toBeInTheDocument();
    });

    it('shows a failed commit as a notice and keeps the form, and closes from Close', async () => {
        const { onClose } = await renderPackage();
        mockRequest.mockResolvedValueOnce({ success: false, error: 'GitHub refused the write.' });
        await click('Save');
        expect(screen.getByTestId('package-error')).toHaveTextContent('GitHub refused the write.');
        expect(nameInput().value).toBe('Bodea');
        await click('Close');
        expect(onClose).toHaveBeenCalled();
    });
});
