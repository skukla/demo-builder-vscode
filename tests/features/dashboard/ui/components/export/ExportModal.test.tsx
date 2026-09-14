/**
 * The Export dialog: how it travels (link or file) and what goes (the parts).
 * The link form needs the storefront to be a demo package and points at that
 * door when it is not; the file form writes one bundle of the ticked parts.
 */

import { fireEvent, screen } from '@testing-library/react';
import { answer, chooseFile, click, LINK, mockRequest, partBox, PREVIEW, renderExport, resetExportMocks } from './ExportModal.testUtils';

describe('ExportModal', () => {
    beforeEach(resetExportMocks);

    it('opens on the link form with the two ways to hand over and the parts, built ones and not-yet ones', async () => {
        await renderExport();
        expect(screen.getByRole('heading', { name: 'Export' })).toBeInTheDocument();
        expect(screen.getByTestId('export-form')).toHaveTextContent('Send a link');
        expect(screen.getByTestId('export-form')).toHaveTextContent('Send a file');
        const parts = screen.getByTestId('export-link-form');
        expect(parts).toHaveTextContent('Setup');
        expect(parts).toHaveTextContent('Travels as a file.');
        expect(parts).toHaveTextContent('Datapack');
        expect(parts).toHaveTextContent('Not yet.');
    });

    describe('the link form', () => {
        it('shows the link when the storefront is a demo package', async () => {
            await renderExport(answer({ ...PREVIEW, saved: true }));
            expect(mockRequest).toHaveBeenCalledWith('getDemoPackagePreview');
            expect(screen.getByTestId('export-link')).toHaveTextContent(LINK);
            expect(screen.queryByTestId('export-not-package')).not.toBeInTheDocument();
        });

        it('points at Save as demo package when it is not one, without saving anything itself', async () => {
            const { props } = await renderExport();
            expect(screen.getByTestId('export-not-package')).toHaveTextContent("Your storefront isn't a demo package yet");
            await click('Save as demo package…');
            expect(props.onSaveDemoPackage).toHaveBeenCalledTimes(1);
            expect(mockRequest).toHaveBeenCalledTimes(1);
        });

        it('says a headless project has no storefront and never asks the host', async () => {
            await renderExport(undefined, { isEds: false });
            expect(screen.getByTestId('export-link-form')).toHaveTextContent('This project has no storefront of its own.');
            expect(mockRequest).not.toHaveBeenCalled();
        });

        it("shows the storefront read's failure", async () => {
            await renderExport({ success: false, error: 'Sign in to GitHub first.' });
            expect(screen.getByTestId('export-link-failed')).toHaveTextContent('Sign in to GitHub first.');
        });
    });

    describe('the file form', () => {
        it('ticks setup and storefront by default, saves one bundle through the host, and reports what and where', async () => {
            await renderExport();
            await chooseFile();
            expect(partBox('part-setup').checked).toBe(true);
            expect(partBox('part-storefront').checked).toBe(true);
            mockRequest.mockResolvedValueOnce(answer({ path: '/Users/steve/bodea-demo-bundle.zip', fileCount: 813, bytes: 1_000, parts: ['setup', 'storefront'] }));

            await click('Save file…');

            expect(mockRequest).toHaveBeenLastCalledWith('exportDemoBundle', { setup: true, storefront: true });
            expect(screen.getByTestId('export-saved')).toHaveTextContent('Saved setup and storefront (813 files) to /Users/steve/bodea-demo-bundle.zip');
        });

        it('sends only the ticked parts, refuses none, and leaves the storefront off for a headless project', async () => {
            await renderExport();
            await chooseFile();
            fireEvent.click(partBox('part-storefront'));
            mockRequest.mockResolvedValueOnce(answer({ path: '/p/x.json', fileCount: 1, parts: ['setup'] }));
            await click('Save file…');
            expect(mockRequest).toHaveBeenLastCalledWith('exportDemoBundle', { setup: true, storefront: false });

            fireEvent.click(partBox('part-setup'));
            expect(screen.getByRole('button', { name: 'Save file…' })).toBeDisabled();
            expect(screen.getByTestId('export-file-form')).toHaveTextContent('Tick at least one part.');
        });

        it('starts with the storefront off and disabled for a headless project, and shows a failure', async () => {
            await renderExport(undefined, { isEds: false });
            await chooseFile();
            expect(partBox('part-storefront').checked).toBe(false);
            expect(partBox('part-storefront').disabled).toBe(true);
            mockRequest.mockResolvedValueOnce({ success: false, error: 'Failed to download archive: HTTP 404' });
            await click('Save file…');
            expect(screen.getByTestId('export-error')).toHaveTextContent('HTTP 404');
        });

        it('says nothing when the save dialog is dismissed', async () => {
            await renderExport();
            await chooseFile();
            mockRequest.mockResolvedValueOnce(answer({ cancelled: true }));
            await click('Save file…');
            expect(screen.queryByTestId('export-saved')).not.toBeInTheDocument();
        });
    });

    it('closes from the Close button', async () => {
        const { props } = await renderExport();
        await click('Close');
        expect(props.onClose).toHaveBeenCalled();
    });
});
