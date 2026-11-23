/**
 * The Share dialog (owner, 2026-10-22: "I do want the merged share dialog").
 * One dialog replaces Export and Save as demo package. Two steps in one window,
 * the house flow Add a Demo uses (owner, 2026-11-18, walk F228): step 1 asks how
 * the demo travels, as two choice cards with a line on each, with Next; step 2 is
 * the chosen form, with Back. The link form is the checks that need the SC first,
 * then the repository as a read-only field, the name and description (always shown,
 * walk F229), and nothing else: the "Add to My Welcome Step" box and the undo moved to Save as
 * Package (owner, 2026-11-18, EDS-72), so the link's save leaves the Welcome step as it is. The
 * button says whether the
 * press will write: "Save and Copy Link" until the details are in the
 * repository (and again after an edit), then "Copy Link". The file form is
 * unchanged from Export.
 */

import { act, fireEvent, screen, within } from '@testing-library/react';
import { revealLabel } from '@/features/dashboard/ui/components/share/ShareResult';
import {
    answer,
    button,
    chooseFile,
    click,
    LINK,
    mockRequest,
    mockWriteText,
    nameInput,
    next,
    partBox,
    PREVIEW,
    renderShare,
    renderShareFile,
    renderShareLink,
    renderSharePending,
    resetShareMocks,
    SAVED,
    sent,
} from './ShareModal.testUtils';

const LINK_LINE = 'For colleagues with access to your repository. Includes later changes.';
const FILE_LINE = 'For colleagues without access. A single zip file, with no later changes.';
const SAVE_AND_COPY = 'Save and Copy Link';

const footer = (): HTMLElement => document.querySelector('.modal-footer-actions') as HTMLElement;
const body = (): HTMLElement => document.querySelector('.modal-body') as HTMLElement;
/** A button's words, without the hidden labels that hold its width (`sizeLabels`). */
function labelOf(button: HTMLElement): string | null {
    const copy = button.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('.modal-button-sizer').forEach((sizer) => sizer.remove());
    return copy.textContent;
}
/** The footer's buttons, left to right. */
const footerLabels = (): Array<string | null> => within(footer()).getAllByRole('button').map(labelOf);

describe('ShareModal', () => {
    beforeEach(resetShareMocks);

    describe('step 1: how to share', () => {
        it('opens under its own title with only the two ways to hand over, as cards', async () => {
            await renderShare();
            expect(screen.getByRole('heading', { name: 'Share Demo' })).toBeInTheDocument();
            // Walk F233: no heading over the cards; the title and the cards say it. Named for screen readers.
            expect(screen.getByTestId('share-form')).not.toHaveTextContent('How to Share');
            expect(screen.getByRole('group', { name: 'How to Share' })).toBeInTheDocument();
            const link = screen.getByTestId('share-form-link');
            const file = screen.getByTestId('share-form-file');
            // Each card names its way and says, at once, who it is for.
            expect(link).toHaveClass('choice-card');
            expect(link).toHaveTextContent('Send a Link');
            expect(link).toHaveTextContent(LINK_LINE);
            expect(file).toHaveTextContent('Send a File');
            expect(file).toHaveTextContent(FILE_LINE);
            expect(link).toHaveAttribute('data-selected', 'true');
            expect(file).toHaveAttribute('data-selected', 'false');
            expect(screen.queryByRole('radio')).not.toBeInTheDocument();
            // Neither form is on this step, nor its checks.
            expect(screen.queryByTestId('share-link-form')).not.toBeInTheDocument();
            expect(screen.queryByTestId('export-file-form')).not.toBeInTheDocument();
            expect(screen.queryByTestId('package-check-index')).not.toBeInTheDocument();
        });

        it('has Close and Next in its footer, Next enabled for the default choice, and no Back', async () => {
            await renderShare();
            expect(footerLabels()).toEqual(['Close', 'Next']);
            expect(button('Next')).not.toHaveAttribute('aria-disabled', 'true');
        });

        it('choosing the file card selects it and stays on the step', async () => {
            await renderShare();
            await chooseFile();
            expect(screen.getByTestId('share-form-file')).toHaveAttribute('data-selected', 'true');
            expect(screen.getByTestId('share-form-link')).toHaveAttribute('data-selected', 'false');
            expect(screen.queryByTestId('export-file-form')).not.toBeInTheDocument();
        });

        it('prints no middle dot', async () => {
            await renderShare();
            // Positive control: the step rendered the text it is searched for.
            expect(screen.getByTestId('share-form')).toHaveTextContent('Send a Link');
            expect(screen.getByTestId('share-form').textContent).not.toContain('·');
        });
    });

    describe('step 2: the chosen form', () => {
        it('Next on the link card shows the link form alone, with Back, Close and its button', async () => {
            await renderShareLink();
            expect(screen.getByTestId('share-link-form')).toBeInTheDocument();
            expect(screen.queryByTestId('share-form')).not.toBeInTheDocument();
            expect(footerLabels()).toEqual(['Back', 'Close', SAVE_AND_COPY]);
        });

        it('Next on the file card shows the file form alone, with Back, Close and Save File', async () => {
            await renderShareFile();
            expect(screen.getByTestId('export-file-form')).toBeInTheDocument();
            expect(screen.queryByTestId('share-form')).not.toBeInTheDocument();
            expect(footerLabels()).toEqual(['Back', 'Close', 'Save File']);
        });

        it('Back returns to step 1 with the choice kept', async () => {
            await renderShareFile();
            await click('Back');
            expect(screen.getByTestId('share-form-file')).toHaveAttribute('data-selected', 'true');
            expect(screen.queryByTestId('export-file-form')).not.toBeInTheDocument();
            expect(footerLabels()).toEqual(['Close', 'Next']);
        });

        it('keeps what the SC set on the link form through Back and Next', async () => {
            await renderShareLink();
            fireEvent.change(nameInput(), { target: { value: 'Bodea by Steve' } });
            await click('Back');
            await next();
            expect(nameInput().value).toBe('Bodea by Steve');
        });
    });

    it('while the storefront is being read, the spinner is the whole body', () => {
        renderSharePending();
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        // A dialog reading what it will show says nothing (dialog design rules).
        expect(screen.queryByText('Checking the storefront')).not.toBeInTheDocument();
        expect(screen.queryByTestId('share-form')).not.toBeInTheDocument();
        expect(screen.queryByTestId('share-link-form')).not.toBeInTheDocument();
    });

    it('a headless project reads only its datapack check, opens on the choice, and its link form says there is no storefront', async () => {
        await renderShare(undefined, { isEds: false });
        // No storefront to read: the one request is the datapack check the file step shows (walk F230).
        expect(mockRequest.mock.calls.map(([type]) => type)).toEqual(['getShareDatapackCheck']);
        expect(screen.getByTestId('share-form')).toBeInTheDocument();
        await next();
        expect(screen.getByTestId('share-link-form')).toHaveTextContent(
            'This project has no storefront of its own. Send a file instead.',
        );
    });

    it("shows the storefront read's failure on the link form", async () => {
        await renderShareLink({ success: false, error: 'Sign In to GitHub First.' });
        expect(screen.getByTestId('share-link-failed')).toHaveTextContent('Sign In to GitHub First.');
    });

    it('prints no middle dot anywhere in the link form', async () => {
        await renderShareLink();
        // Positive control: the form rendered the text it is searched for.
        expect(screen.getByTestId('share-link-form')).toHaveTextContent('Repository');
        expect(screen.getByTestId('share-link-form').textContent).not.toContain('·');
    });

    // Walk F231 (owner): a label beside a code-font address read as debug output. It is
    // the read-only field Edit Demo uses, its label above like Name and Description.
    it('shows the repository as a read-only field, its label above, in the body font', async () => {
        await renderShareLink();
        const repository = screen.getByRole('textbox', { name: 'Repository' }) as HTMLInputElement;
        expect(repository.value).toBe(LINK);
        expect(repository).toHaveAttribute('readonly');
        expect(screen.getByTestId('share-link').querySelector('code')).toBeNull();
    });

    describe('the link and its button', () => {
        it('a storefront that already carries its details: the button only copies', async () => {
            await renderShareLink(answer({ ...PREVIEW, saved: true, onList: true }));
            expect((screen.getByRole('textbox', { name: 'Repository' }) as HTMLInputElement).value).toBe(LINK);
            expect(screen.queryByRole('button', { name: SAVE_AND_COPY })).not.toBeInTheDocument();

            await click('Copy Link');

            expect(mockWriteText).toHaveBeenCalledWith(LINK);
            expect(sent('saveDemoPackage')).toHaveLength(0);
            expect(button('Copied')).toBeInTheDocument();
        });

        // EDS-72: the link's save writes the details and leaves the Welcome step as it is, so it
        // sends no addToWelcome at all (omitted is the handler's "do not touch the list").
        it('a storefront without them: the button says it saves, writes the prefilled details alone, then copies', async () => {
            await renderShareLink();
            // A button labelled only "Copy link" must not write.
            expect(screen.queryByRole('button', { name: 'Copy Link' })).not.toBeInTheDocument();
            mockRequest.mockResolvedValueOnce(answer(SAVED));

            await click(SAVE_AND_COPY);

            const [[, request]] = sent('saveDemoPackage');
            expect(request).toEqual({ name: 'Bodea', description: 'Bodea-branded B2B demo' });
            expect(request).not.toHaveProperty('addToWelcome');
            expect(mockWriteText).toHaveBeenCalledWith(LINK);
            expect(button('Copied')).toBeInTheDocument();
        });

        it('once saved, a second press only copies', async () => {
            await renderShareLink();
            mockRequest.mockResolvedValueOnce(answer(SAVED));
            await click(SAVE_AND_COPY);
            act(() => {
                jest.runOnlyPendingTimers();
            });

            await click('Copy Link');

            expect(sent('saveDemoPackage')).toHaveLength(1);
            expect(mockWriteText).toHaveBeenCalledTimes(2);
        });

        it('a write that fails copies nothing, says so, and keeps the save wording', async () => {
            await renderShareLink();
            mockRequest.mockResolvedValueOnce({ success: false, error: 'GitHub refused the write.' });

            await click(SAVE_AND_COPY);

            expect(mockWriteText).not.toHaveBeenCalled();
            // A note line beside the button, not a box.
            expect(screen.getByTestId('share-error')).toHaveTextContent("Couldn't prepare the link. GitHub refused the write.");
            expect(screen.getByTestId('share-error')).toHaveClass('dialog-problem', 'text-negative');
            expect(button(SAVE_AND_COPY)).toBeInTheDocument();
        });

        it('a package file that is not ours is left unchanged, said so plainly, and the link is still copied', async () => {
            await renderShareLink();
            mockRequest.mockResolvedValueOnce(
                answer({ ...SAVED, file: 'skipped', fileReason: 'demo.demo-builder.json is already there and was not written by Demo Builder.' }),
            );

            await click(SAVE_AND_COPY);

            // Walk F244: one plain sentence, not the handler's file name and reason.
            expect(screen.getByTestId('share-skipped')).toHaveTextContent("The package file in your repository wasn't created by Demo Builder, so it was left unchanged.");
            expect(screen.getByTestId('share-skipped')).not.toHaveTextContent('demo.demo-builder.json');
            expect(mockWriteText).toHaveBeenCalledWith(LINK);
        });
    });

    describe('the checks', () => {
        it('come first on the link form, above the repository', async () => {
            await renderShareLink();
            const notice = screen.getByTestId('package-check-index');
            const repository = screen.getByText('Repository');
            // DOCUMENT_POSITION_FOLLOWING: the repository comes after the notice.
            expect(notice.compareDocumentPosition(repository) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        });

        it('shows only the ones that need the SC, each as an amber notice, with the republish hint', async () => {
            await renderShareLink();
            const index = screen.getByTestId('package-check-index');
            expect(index).toHaveClass('inline-notice');
            expect(index).not.toHaveClass('inline-notice--info');
            expect(index).toHaveTextContent('Colleagues would start with an empty site.');
            expect(index).toHaveTextContent('Republish, then save again.');
            expect(screen.queryByText('Before Sharing')).not.toBeInTheDocument();
            expect(screen.queryByTestId('package-check-repository')).not.toBeInTheDocument();
            // Sentences, not a list with dots.
            expect(screen.getByTestId('share-link-form').querySelector('ul, li')).toBeNull();
        });

        it('says nothing when every check passes', async () => {
            const allOk = PREVIEW.checks.map((check) => ({ ...check, ok: true }));
            await renderShareLink(answer({ ...PREVIEW, checks: allOk }));
            // Positive control: the form itself rendered.
            expect(screen.getByTestId('share-link')).toHaveTextContent('Repository');
            expect(screen.queryByText('Before Sharing')).not.toBeInTheDocument();
            expect(screen.queryByTestId('package-check-index')).not.toBeInTheDocument();
        });

        it('says so when the repository is private, before anything is sent', async () => {
            const privateRepo = {
                id: 'repository' as const,
                ok: false,
                message: "This storefront's code is private. Colleagues will need access to it, or make it public.",
            };
            await renderShareLink(answer({ ...PREVIEW, checks: [privateRepo] }));
            expect(screen.getByTestId('package-check-repository')).toHaveTextContent("This storefront's code is private.");
        });

        // Walk F227: the pack by its name under a title, never its code or where it is kept.
        it("names a pack only the SC can see under the extension's title", async () => {
            const privatePack = {
                id: 'datapack' as const,
                ok: false,
                title: "Colleagues Can't Use This Demo's Data Yet",
                message: 'Release Save Test 2 is only visible to you.',
            };
            await renderShareLink(answer({ ...PREVIEW, checks: [privatePack] }));
            const notice = screen.getByTestId('package-check-datapack');
            expect(notice).toHaveClass('inline-notice');
            expect(within(notice).getByText("Colleagues Can't Use This Demo's Data Yet")).toHaveClass('inline-notice-title');
            expect(notice).toHaveTextContent('Release Save Test 2 is only visible to you.');
        });
    });

    describe('name and description', () => {
        // Walk F229 (owner): the details were hidden behind a link; they always show now.
        it('always show, prefilled from the draft, with no link to reveal them', async () => {
            await renderShareLink();

            expect(nameInput().value).toBe('Bodea');
            expect(screen.getByTestId('share-description')).toBeInTheDocument();
            expect(screen.queryByText('Change Name or Description')).not.toBeInTheDocument();
        });

        it('an edit on a saved storefront turns the button back into a save, and sends the trimmed name', async () => {
            await renderShareLink(answer({ ...PREVIEW, saved: true, onList: true }));
            expect(button('Copy Link')).toBeInTheDocument();

            fireEvent.change(nameInput(), { target: { value: ' Bodea by Steve ' } });
            mockRequest.mockResolvedValueOnce(answer(SAVED));
            await click(SAVE_AND_COPY);

            const [[, request]] = sent('saveDemoPackage');
            expect(request).toEqual({ name: 'Bodea by Steve', description: 'Bodea-branded B2B demo' });
            expect(request).not.toHaveProperty('addToWelcome');
        });

        it('an empty name disables the button', async () => {
            await renderShareLink();
            fireEvent.change(nameInput(), { target: { value: '   ' } });
            expect(button(SAVE_AND_COPY)).toHaveAttribute('aria-disabled', 'true');
        });
    });

    // EDS-72 (owner: Share Demo is not the place for it): the Welcome box and the undo moved to
    // Save as Package on the dashboard.
    it('has no Welcome box and no undo, even for a storefront already on the Welcome step', async () => {
        await renderShareLink(answer({ ...PREVIEW, saved: true, onList: true }));
        // Positive control: the form rendered.
        expect(screen.getByTestId('share-link')).toHaveTextContent('Repository');
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(screen.getByTestId('share-link-form')).not.toHaveTextContent('Welcome');
        expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
    });

    describe('the file form', () => {
        // Walk F236 (owner: "the success state is terrible"): a grey line under the boxes left the
        // window looking as it did before. The window becomes the house result: the large mark,
        // File Saved, the file and its folder, and Reveal in Finder.
        it('ticks setup and storefront by default, saves one bundle through the host, and shows the result', async () => {
            await renderShareFile();
            expect(partBox('Setup').checked).toBe(true);
            expect(partBox('Storefront').checked).toBe(true);
            mockRequest.mockResolvedValueOnce(
                answer({ path: '/Users/steve/bodea-demo-bundle.zip', fileCount: 813, bytes: 1_000, parts: ['setup', 'storefront'] }),
            );

            await click('Save File');

            expect(mockRequest).toHaveBeenLastCalledWith('exportDemoBundle', { setup: true, storefront: true });
            const result = screen.getByTestId('result-body');
            expect(result).toHaveTextContent('File Saved');
            expect(result).toHaveTextContent('bodea-demo-bundle.zip in steve');
            expect(screen.queryByTestId('export-file-form')).not.toBeInTheDocument();
            expect(footerLabels()).toEqual(['Close', revealLabel()]);

            mockRequest.mockResolvedValueOnce({ success: true });
            await click(revealLabel());
            expect(mockRequest).toHaveBeenLastCalledWith('revealFile', { path: '/Users/steve/bodea-demo-bundle.zip' });
        });

        it('sends only the ticked parts and refuses none', async () => {
            await renderShareFile();
            fireEvent.click(partBox('Storefront'));
            fireEvent.click(partBox('Setup'));
            expect(button('Save File')).toHaveAttribute('aria-disabled', 'true');
            fireEvent.click(partBox('Setup'));
            mockRequest.mockResolvedValueOnce(answer({ path: '/p/x.json', fileCount: 1, parts: ['setup'] }));
            await click('Save File');
            expect(mockRequest).toHaveBeenLastCalledWith('exportDemoBundle', { setup: true, storefront: false });
        });

        it('greys Save File when nothing is ticked, with no line about it (walk F238)', async () => {
            await renderShareFile();
            fireEvent.click(partBox('Storefront'));
            fireEvent.click(partBox('Setup'));
            expect(button('Save File')).toHaveAttribute('aria-disabled', 'true');
            expect(screen.getByTestId('export-file-form')).not.toHaveTextContent('Select at least one part.');
        });

        it('starts with the storefront off and disabled for a headless project, and shows a failure', async () => {
            await renderShareFile({ isEds: false });
            expect(partBox('Storefront').checked).toBe(false);
            expect(partBox('Storefront').disabled).toBe(true);
            mockRequest.mockResolvedValueOnce({ success: false, error: 'Failed to download archive: HTTP 404' });
            await click('Save File');
            // Walk F238: a failed save is the result window, as a saved one is (F236), with Try Again.
            const result = screen.getByTestId('result-body');
            expect(result).toHaveTextContent("Couldn't Save File");
            expect(result).toHaveTextContent('HTTP 404');
            expect(screen.queryByTestId('export-file-form')).not.toBeInTheDocument();
            expect(footerLabels()).toEqual(['Close', 'Try Again']);

            mockRequest.mockResolvedValueOnce(answer({ path: '/p/x.json', fileCount: 1, parts: ['setup'] }));
            await click('Try Again');
            expect(mockRequest).toHaveBeenLastCalledWith('exportDemoBundle', { setup: true, storefront: false });
            expect(screen.getByTestId('result-body')).toHaveTextContent('File Saved');
        });

        it('says nothing when the save dialog is dismissed', async () => {
            await renderShareFile();
            mockRequest.mockResolvedValueOnce(answer({ cancelled: true }));
            await click('Save File');
            expect(screen.queryByTestId('result-body')).not.toBeInTheDocument();
            expect(screen.getByTestId('export-file-form')).toBeInTheDocument();
        });
    });

    // Step-07 Win2, walk F228: a Steps window per step, as Add a Demo has. Each form's main button
    // sits in the footer, and each step opens at its own height and holds it, so a note never grows it.
    describe('the window', () => {
        it("puts the link form's button in the footer, beside Close", async () => {
            await renderShareLink(answer({ ...PREVIEW, saved: true, onList: true }));

            expect(within(footer()).getByRole('button', { name: 'Copy Link' })).toBeInTheDocument();
            expect(within(body()).queryByRole('button', { name: 'Copy Link' })).toBeNull();
            expect(within(footer()).getByRole('button', { name: 'Close' })).toBeInTheDocument();
        });

        it("puts the file form's Save File in the footer in its place", async () => {
            await renderShareFile();

            expect(within(footer()).getByRole('button', { name: 'Save File' })).toBeInTheDocument();
            expect(within(footer()).queryByRole('button', { name: SAVE_AND_COPY })).toBeNull();
            expect(within(body()).queryByRole('button', { name: 'Save File' })).toBeNull();
        });

        it('offers no link button when there is no storefront to link to', async () => {
            await renderShareLink(undefined, { isEds: false });

            expect(footerLabels()).toEqual(['Back', 'Close']);
        });

        it('opens each step as a window of its own, held at its own height', async () => {
            await renderShare();
            const first = screen.getByRole('dialog');
            expect(first).toHaveClass('is-locked');

            await next();

            const second = screen.getByRole('dialog');
            expect(second).not.toBe(first);
            expect(second).toHaveClass('is-locked');
        });

        it("keeps the link button the width of its own widest label, so Close never moves", async () => {
            await renderShareLink();
            const sizers = Array.from(footer().querySelectorAll('.modal-button-sizer')).map((s) => s.textContent);

            // Only the labels this step's button can show: Save File is the other step's (walk F230).
            expect(sizers).toEqual(['Copy Link', SAVE_AND_COPY, 'Copied']);
        });
    });

    it('closes from the Close button', async () => {
        const { props } = await renderShare();
        await click('Close');
        expect(props.onClose).toHaveBeenCalled();
    });
});
