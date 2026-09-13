/**
 * The Export dialog: the setup-file part for every project, the storefront part
 * (a demo package) for Edge Delivery projects. The storefront part reads once on
 * open, prefills from the project, lists the checks, and commits at Save and
 * Remove only.
 */

import { fireEvent, screen } from '@testing-library/react';
import {
    answer,
    click,
    LINK,
    mockRequest,
    nameInput,
    PREVIEW,
    REMOVED,
    renderExport,
    resetExportMocks,
    SAVED,
    templateBox,
} from './ExportModal.testUtils';

describe('ExportModal', () => {
    beforeEach(resetExportMocks);

    describe('the setup-file part', () => {
        it('is offered to every project and hands the save to the host', async () => {
            const { props } = await renderExport(undefined, { isEds: false });
            expect(screen.getByTestId('export-setup')).toHaveTextContent('A colleague imports it to build a project with the same setup.');
            expect(screen.queryByTestId('export-storefront')).not.toBeInTheDocument();
            expect(mockRequest).not.toHaveBeenCalled();

            await click('Save setup file…');
            expect(props.onExportSetup).toHaveBeenCalledTimes(1);
        });

        it('closes from the Close button', async () => {
            const { props } = await renderExport();
            await click('Close');
            expect(props.onClose).toHaveBeenCalled();
        });
    });

    describe('the storefront part', () => {
        it('reads the preview on open, says what becomes of the storefront, prefills the name, and lists the checks with the republish hint', async () => {
            await renderExport();

            expect(mockRequest).toHaveBeenCalledWith('getDemoPackagePreview');
            expect(screen.getByTestId('export-storefront')).toHaveTextContent('Puts this storefront on your Welcome step as a card.');
            expect(nameInput().value).toBe('Bodea');
            expect(screen.getByTestId('package-check-repository')).toHaveTextContent('steve/kukla-bodea is public.');
            expect(screen.getByTestId('package-check-index')).toHaveTextContent('Republish, then save again.');
            expect(templateBox().checked).toBe(false);
            expect(screen.queryByRole('button', { name: 'Remove demo package' })).not.toBeInTheDocument();
            expect(screen.queryByTestId('package-link')).not.toBeInTheDocument();
        });

        it('shows the refusal when the storefront cannot become a demo package', async () => {
            await renderExport({ success: false, error: 'Only an Edge Delivery project can become a demo package from here.' });
            expect(screen.getByText("This storefront can't become a demo package")).toBeInTheDocument();
            expect(screen.getByText(/Only an Edge Delivery project/)).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
        });

        it('sends the edited name, the description and the template choice at Save, then shows the link', async () => {
            await renderExport();
            fireEvent.change(nameInput(), { target: { value: ' Bodea by Steve ' } });
            fireEvent.click(templateBox());
            mockRequest.mockResolvedValueOnce(answer({ ...SAVED, templateFlagSet: true }));

            await click('Save');

            expect(mockRequest).toHaveBeenLastCalledWith('saveDemoPackage', {
                name: 'Bodea by Steve',
                description: 'Bodea-branded B2B demo',
                markTemplate: true,
            });
            expect(screen.getByTestId('package-link')).toHaveTextContent("Saved. It's on your Welcome step now.");
            expect(screen.getByTestId('package-link')).toHaveTextContent(LINK);
            expect(screen.getByRole('button', { name: 'Remove demo package' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
        });

        it('disables Save while the name is empty', async () => {
            await renderExport();
            fireEvent.change(nameInput(), { target: { value: '   ' } });
            expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        });

        it('says when the file in the repository was not ours and was left alone, and that the card is saved anyway', async () => {
            await renderExport();
            mockRequest.mockResolvedValueOnce(
                answer({ ...SAVED, file: 'skipped', fileReason: 'demo.demo-builder.json is already there and was not written by Demo Builder, or was edited since.' }),
            );
            await click('Save');
            expect(screen.getByTestId('package-skipped')).toHaveTextContent('Card saved; the file in your repository was left alone');
            expect(screen.getByTestId('package-skipped')).toHaveTextContent('was not written by Demo Builder');
            expect(screen.queryByTestId('package-link')).not.toBeInTheDocument();
        });

        it('offers Remove for a saved package (or a card already on the list) and reports what it undid', async () => {
            await renderExport(answer({ ...PREVIEW, saved: false, onList: true, templateFlagSet: true }));
            expect(screen.getByTestId('package-link')).toHaveTextContent(LINK);
            expect(templateBox().checked).toBe(true);
            mockRequest.mockResolvedValueOnce(answer(REMOVED));

            await click('Remove demo package');

            expect(mockRequest).toHaveBeenLastCalledWith('removeDemoPackage');
            expect(screen.getByTestId('package-removed')).toHaveTextContent('The card is off your Welcome step and the file is out of your repository.');
            expect(screen.queryByRole('button', { name: 'Remove demo package' })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
            expect(templateBox().checked).toBe(false);
        });

        it('shows a failed commit as a notice and keeps the form', async () => {
            await renderExport();
            mockRequest.mockResolvedValueOnce({ success: false, error: 'GitHub refused the write.' });
            await click('Save');
            expect(screen.getByTestId('package-error')).toHaveTextContent('GitHub refused the write.');
            expect(nameInput().value).toBe('Bodea');
        });
    });
});
