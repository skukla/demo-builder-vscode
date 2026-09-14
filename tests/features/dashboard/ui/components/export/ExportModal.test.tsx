/**
 * The Export dialog: how it travels (link or file). The link form IS the link
 * and a Copy button. A link carries nothing, so Copy writes the demo's name and
 * description into the repository the first time (the same handler as Save as
 * demo package, prefilled) and then copies; a storefront that already carries
 * them is only copied. No warning, no prerequisite (owner, 2026-09-14). The file
 * form asks what to include and writes one bundle of the ticked parts.
 */

import { fireEvent, screen } from '@testing-library/react';
import { answer, chooseFile, click, LINK, mockRequest, mockWriteText, partBox, PREVIEW, renderExport, renderExportPending, resetExportMocks } from './ExportModal.testUtils';

describe('ExportModal', () => {
    beforeEach(resetExportMocks);

    it('opens on the link form with the two ways to hand over, and no parts list', async () => {
        await renderExport();
        expect(screen.getByRole('heading', { name: 'Export' })).toBeInTheDocument();
        expect(screen.getByTestId('export-form')).toHaveTextContent('Send a link');
        expect(screen.getByTestId('export-form')).toHaveTextContent('Send a file');
        expect(screen.queryByText('What goes')).not.toBeInTheDocument();
        expect(screen.queryByText('What to include')).not.toBeInTheDocument();
        expect(screen.queryByText('Not yet.')).not.toBeInTheDocument();
    });

    it('while the storefront is being read, the spinner is the whole body: no choice cards, no forms', async () => {
        // Owner, 2026-09-14: a dialog that has to check something shows the
        // house spinner first, then its UX — the same shape as Save as demo package.
        renderExportPending();
        expect(screen.getByText('Checking the storefront')).toBeInTheDocument();
        expect(screen.queryByTestId('export-form')).not.toBeInTheDocument();
        expect(screen.queryByTestId('export-link-form')).not.toBeInTheDocument();
    });

    it('a headless project has nothing to read and opens straight on the choice', async () => {
        await renderExport(undefined, { isEds: false });
        expect(mockRequest).not.toHaveBeenCalled();
        expect(screen.getByTestId('export-form')).toBeInTheDocument();
    });

    describe('the link form', () => {
        it('a storefront that already carries its description: Copy link only copies', async () => {
            await renderExport(answer({ ...PREVIEW, saved: true }));
            expect(mockRequest).toHaveBeenCalledWith('getDemoPackagePreview');
            const link = screen.getByTestId('export-link');
            expect(link).toHaveTextContent(LINK);
            expect(link).not.toHaveTextContent(/writes the demo's name/);
            // No save hand-off: the storefront already carries its description.
            expect(screen.queryByText(/as a demo package/)).not.toBeInTheDocument();

            await click('Copy link');

            expect(mockWriteText).toHaveBeenCalledWith(LINK);
            expect(mockRequest).toHaveBeenCalledTimes(1);
            expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
        });

        it('a storefront without one: the link shows with no warning, and Copy link writes the prefilled description first, then copies', async () => {
            await renderExport();
            const link = screen.getByTestId('export-link');
            expect(link).toHaveTextContent(LINK);
            expect(link).toHaveTextContent("Copying also writes the demo's name and description into your repository");
            expect(screen.queryByText(/Not a demo package|Save as demo package/)).not.toBeInTheDocument();
            expect(screen.getByTestId('export-link-form')).not.toHaveTextContent(/Setup|Datapack|Content|Integrations/);
            mockRequest.mockResolvedValueOnce(answer({ link: LINK, file: 'written', onList: true, checks: PREVIEW.checks }));

            await click('Copy link');

            expect(mockRequest).toHaveBeenLastCalledWith('saveDemoPackage', { name: 'Bodea', description: 'Bodea-branded B2B demo' });
            expect(mockWriteText).toHaveBeenCalledWith(LINK);
            expect(link).not.toHaveTextContent(/writes the demo's name/);
        });

        it('a description write that fails copies nothing and says so', async () => {
            await renderExport();
            mockRequest.mockResolvedValueOnce({ success: false, error: 'GitHub refused the write.' });

            await click('Copy link');

            expect(mockWriteText).not.toHaveBeenCalled();
            expect(screen.getByTestId('export-copy-failed')).toHaveTextContent('GitHub refused the write.');
            expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
        });

        it('says a headless project has no storefront and never asks the host', async () => {
            await renderExport(undefined, { isEds: false });
            expect(screen.getByTestId('export-link-form')).toHaveTextContent('This project has no storefront of its own. Send a file instead.');
            expect(mockRequest).not.toHaveBeenCalled();
        });

        it("shows the storefront read's failure", async () => {
            await renderExport({ success: false, error: 'Sign in to GitHub first.' });
            expect(screen.getByTestId('export-link-failed')).toHaveTextContent('Sign in to GitHub first.');
        });
    });

    describe('the file form', () => {
        it('ticks setup and storefront by default, lists only the parts that exist, saves one bundle through the host, and reports what and where', async () => {
            await renderExport();
            await chooseFile();
            expect(screen.getByText('What to include')).toBeInTheDocument();
            expect(screen.getByTestId('export-file-form')).not.toHaveTextContent(/Datapack|Not yet/);
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
