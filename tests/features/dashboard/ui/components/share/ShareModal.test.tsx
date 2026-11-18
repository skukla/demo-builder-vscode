/**
 * The Share dialog (owner, 2026-10-22: "I do want the merged share dialog").
 * One dialog replaces Export and Save as demo package. It asks how the demo
 * travels first, as two choice cards with a line on each, as Add a Demo asks link or
 * zip (owner, 2026-11-18, walk F227). The link
 * form is the link and one button, the "Also show it on my Welcome step" box,
 * the name and description behind a quiet link, only the checks that need the
 * SC, and the undo. The button
 * says whether the press will write: "Save details and copy link" until the
 * details are in the repository (and again after an edit), then "Copy link".
 * The file form is unchanged from Export.
 */

import { act, fireEvent, screen, within } from '@testing-library/react';
import {
    answer,
    button,
    chooseFile,
    click,
    LINK,
    mockRequest,
    mockWriteText,
    nameInput,
    openDetails,
    partBox,
    PREVIEW,
    REMOVED,
    renderShare,
    renderSharePending,
    resetShareMocks,
    SAVED,
    sent,
    welcomeBox,
} from './ShareModal.testUtils';

const LINK_LINE = 'For colleagues with access to your repository. Includes later changes.';
const FILE_LINE = 'For colleagues without access. A single zip file, with no later changes.';
const SAVE_AND_COPY = 'Save Details and Copy Link';

describe('ShareModal', () => {
    beforeEach(resetShareMocks);

    it('opens under its own title on the link form, with the two ways to hand over as cards', async () => {
        await renderShare();
        expect(screen.getByRole('heading', { name: 'Share Demo' })).toBeInTheDocument();
        expect(screen.getByTestId('share-form')).toHaveTextContent('How to Share');
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
        expect(screen.queryByText('What to Include')).not.toBeInTheDocument();
    });

    it('choosing the file card selects it and shows the file form', async () => {
        await renderShare();
        await chooseFile();
        expect(screen.getByTestId('share-form-file')).toHaveAttribute('data-selected', 'true');
        expect(screen.getByTestId('share-form-link')).toHaveAttribute('data-selected', 'false');
        expect(screen.getByText('What to Include')).toBeInTheDocument();
    });

    it('while the storefront is being read, the spinner is the whole body', () => {
        renderSharePending();
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        // A dialog reading what it will show says nothing (dialog design rules).
        expect(screen.queryByText('Checking the storefront')).not.toBeInTheDocument();
        expect(screen.queryByTestId('share-form')).not.toBeInTheDocument();
        expect(screen.queryByTestId('share-link-form')).not.toBeInTheDocument();
    });

    it('a headless project has nothing to read, opens on the choice, and says there is no storefront', async () => {
        await renderShare(undefined, { isEds: false });
        expect(mockRequest).not.toHaveBeenCalled();
        expect(screen.getByTestId('share-link-form')).toHaveTextContent(
            'This project has no storefront of its own. Send a file instead.',
        );
    });

    it("shows the storefront read's failure", async () => {
        await renderShare({ success: false, error: 'Sign In to GitHub First.' });
        expect(screen.getByTestId('share-link-failed')).toHaveTextContent('Sign In to GitHub First.');
    });

    it('prints no middle dot anywhere in the link form', async () => {
        await renderShare();
        await openDetails();
        // Positive control: the form rendered the text it is searched for.
        expect(screen.getByTestId('share-link-form')).toHaveTextContent(LINK);
        expect(screen.getByTestId('share-link-form').textContent).not.toContain('·');
        expect(screen.getByTestId('share-form').textContent).not.toContain('·');
    });

    describe('the link and its button', () => {
        it('a storefront that already carries its details: the button only copies', async () => {
            await renderShare(answer({ ...PREVIEW, saved: true, onList: true }));
            const link = screen.getByTestId('share-link');
            expect(link).toHaveTextContent(LINK);
            expect(screen.queryByRole('button', { name: SAVE_AND_COPY })).not.toBeInTheDocument();

            await click('Copy Link');

            expect(mockWriteText).toHaveBeenCalledWith(LINK);
            expect(sent('saveDemoPackage')).toHaveLength(0);
            expect(button('Copied')).toBeInTheDocument();
        });

        it('a storefront without them: the button says it saves, writes the prefilled details with the card, then copies', async () => {
            await renderShare();
            // A button labelled only "Copy link" must not write.
            expect(screen.queryByRole('button', { name: 'Copy Link' })).not.toBeInTheDocument();
            mockRequest.mockResolvedValueOnce(answer(SAVED));

            await click(SAVE_AND_COPY);

            expect(mockRequest).toHaveBeenLastCalledWith('saveDemoPackage', {
                name: 'Bodea',
                description: 'Bodea-branded B2B demo',
                addToWelcome: true,
            });
            expect(mockWriteText).toHaveBeenCalledWith(LINK);
            expect(button('Copied')).toBeInTheDocument();
        });

        it('once saved, a second press only copies', async () => {
            await renderShare();
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
            await renderShare();
            mockRequest.mockResolvedValueOnce({ success: false, error: 'GitHub refused the write.' });

            await click(SAVE_AND_COPY);

            expect(mockWriteText).not.toHaveBeenCalled();
            // A note line beside the button, not a box.
            expect(screen.getByTestId('share-error')).toHaveTextContent("Couldn't prepare the link. GitHub refused the write.");
            expect(screen.getByTestId('share-error')).toHaveClass('dialog-problem', 'text-negative');
            expect(button(SAVE_AND_COPY)).toBeInTheDocument();
        });

        it('a details file that is not ours is left alone, said so, and the link is still copied', async () => {
            await renderShare();
            mockRequest.mockResolvedValueOnce(
                answer({ ...SAVED, file: 'skipped', fileReason: 'demo.demo-builder.json is already there and was not written by Demo Builder.' }),
            );

            await click(SAVE_AND_COPY);

            expect(screen.getByTestId('share-skipped')).toHaveTextContent('was not written by Demo Builder');
            expect(mockWriteText).toHaveBeenCalledWith(LINK);
        });
    });

    describe('the checks', () => {
        it('shows only the ones that need the SC, each as an amber notice, with the republish hint', async () => {
            await renderShare();
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
            await renderShare(answer({ ...PREVIEW, checks: allOk }));
            // Positive control: the form itself rendered.
            expect(screen.getByTestId('share-link')).toHaveTextContent(LINK);
            expect(screen.queryByText('Before Sharing')).not.toBeInTheDocument();
            expect(screen.queryByTestId('package-check-index')).not.toBeInTheDocument();
        });

        it('says so when the repository is private, before anything is sent', async () => {
            const privateRepo = {
                id: 'repository' as const,
                ok: false,
                message: "This storefront's code is private. Colleagues will need access to it, or make it public.",
            };
            await renderShare(answer({ ...PREVIEW, checks: [privateRepo] }));
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
            await renderShare(answer({ ...PREVIEW, checks: [privatePack] }));
            const notice = screen.getByTestId('package-check-datapack');
            expect(notice).toHaveClass('inline-notice');
            expect(within(notice).getByText("Colleagues Can't Use This Demo's Data Yet")).toHaveClass('inline-notice-title');
            expect(notice).toHaveTextContent('Release Save Test 2 is only visible to you.');
        });
    });

    describe('name and description', () => {
        it('sit behind a quiet link, prefilled from the draft', async () => {
            await renderShare();
            expect(screen.queryByTestId('share-name')).not.toBeInTheDocument();

            await openDetails();

            expect(nameInput().value).toBe('Bodea');
            expect(screen.getByTestId('share-description')).toBeInTheDocument();
        });

        it('an edit on a saved storefront turns the button back into a save, and sends the trimmed name', async () => {
            await renderShare(answer({ ...PREVIEW, saved: true, onList: true }));
            await openDetails();
            expect(button('Copy Link')).toBeInTheDocument();

            fireEvent.change(nameInput(), { target: { value: ' Bodea by Steve ' } });
            mockRequest.mockResolvedValueOnce(answer(SAVED));
            await click(SAVE_AND_COPY);

            expect(mockRequest).toHaveBeenLastCalledWith('saveDemoPackage', {
                name: 'Bodea by Steve',
                description: 'Bodea-branded B2B demo',
                addToWelcome: true,
            });
        });

        it('an empty name disables the button', async () => {
            await renderShare();
            await openDetails();
            fireEvent.change(nameInput(), { target: { value: '   ' } });
            expect(button(SAVE_AND_COPY)).toHaveAttribute('aria-disabled', 'true');
        });
    });

    describe('"Show on Welcome Step"', () => {
        it('is the house checkbox row', async () => {
            await renderShare();
            expect(welcomeBox().closest('.checkbox-row')).not.toBeNull();
        });

        it('is ticked by default for a storefront not yet shared, and unticked sends addToWelcome:false', async () => {
            await renderShare();
            expect(welcomeBox().checked).toBe(true);

            fireEvent.click(welcomeBox());
            mockRequest.mockResolvedValueOnce(answer({ ...SAVED, onList: false }));
            await click(SAVE_AND_COPY);

            expect(mockRequest).toHaveBeenLastCalledWith('saveDemoPackage', expect.objectContaining({ addToWelcome: false }));
        });

        it('says what is true for a saved storefront whose card is off the list, and a change is a save', async () => {
            await renderShare(answer({ ...PREVIEW, saved: true, onList: false }));
            expect(welcomeBox().checked).toBe(false);
            expect(button('Copy Link')).toBeInTheDocument();

            fireEvent.click(welcomeBox());

            expect(button(SAVE_AND_COPY)).toBeInTheDocument();
        });
    });

    describe('the undo', () => {
        it('is not offered before anything was saved', async () => {
            await renderShare();
            expect(screen.queryByRole('button', { name: 'Remove the Details from My Repository' })).not.toBeInTheDocument();
        });

        it('removes the details and the card, says what it undid, and the button goes back to saving', async () => {
            await renderShare(answer({ ...PREVIEW, saved: true, onList: true }));
            mockRequest.mockResolvedValueOnce(answer(REMOVED));

            await click('Remove the Details from My Repository');

            expect(mockRequest).toHaveBeenLastCalledWith('removeDemoPackage');
            expect(screen.getByTestId('share-removed')).toHaveTextContent(
                'The details are out of your repository and the card is off your Welcome step.',
            );
            expect(screen.getByTestId('share-removed')).toHaveClass('dialog-note');
            expect(button(SAVE_AND_COPY)).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Remove the Details from My Repository' })).not.toBeInTheDocument();
        });

        it('is offered for a card on the list even when the file is not ours', async () => {
            await renderShare(answer({ ...PREVIEW, saved: false, onList: true }));
            expect(button('Remove the Details from My Repository')).toBeInTheDocument();
        });
    });

    describe('the file form', () => {
        it('ticks setup and storefront by default, saves one bundle through the host, and reports what and where', async () => {
            await renderShare();
            await chooseFile();
            expect(screen.getByText('What to Include')).toBeInTheDocument();
            expect(partBox('part-setup').checked).toBe(true);
            expect(partBox('part-storefront').checked).toBe(true);
            mockRequest.mockResolvedValueOnce(
                answer({ path: '/Users/steve/bodea-demo-bundle.zip', fileCount: 813, bytes: 1_000, parts: ['setup', 'storefront'] }),
            );

            await click('Save File');

            expect(mockRequest).toHaveBeenLastCalledWith('exportDemoBundle', { setup: true, storefront: true });
            expect(screen.getByTestId('export-saved')).toHaveTextContent(
                'Saved setup and storefront (813 files) to /Users/steve/bodea-demo-bundle.zip',
            );
            expect(screen.getByTestId('export-saved')).toHaveClass('dialog-note');
        });

        it('sends only the ticked parts and refuses none', async () => {
            await renderShare();
            await chooseFile();
            fireEvent.click(partBox('part-storefront'));
            mockRequest.mockResolvedValueOnce(answer({ path: '/p/x.json', fileCount: 1, parts: ['setup'] }));
            await click('Save File');
            expect(mockRequest).toHaveBeenLastCalledWith('exportDemoBundle', { setup: true, storefront: false });

            fireEvent.click(partBox('part-setup'));
            expect(button('Save File')).toHaveAttribute('aria-disabled', 'true');
            expect(screen.getByTestId('export-file-form')).toHaveTextContent('Select at least one part.');
        });

        it('starts with the storefront off and disabled for a headless project, and shows a failure', async () => {
            await renderShare(undefined, { isEds: false });
            await chooseFile();
            expect(partBox('part-storefront').checked).toBe(false);
            expect(partBox('part-storefront').disabled).toBe(true);
            mockRequest.mockResolvedValueOnce({ success: false, error: 'Failed to download archive: HTTP 404' });
            await click('Save File');
            expect(screen.getByTestId('export-error')).toHaveTextContent('HTTP 404');
        });

        it('says nothing when the save dialog is dismissed', async () => {
            await renderShare();
            await chooseFile();
            mockRequest.mockResolvedValueOnce(answer({ cancelled: true }));
            await click('Save File');
            expect(screen.queryByTestId('export-saved')).not.toBeInTheDocument();
        });
    });

    // Step-07 Win2: a Steps window. Each form's main button sits in the footer, and the window
    // opens at the taller form's height and holds it, so switching forms or a note never grows it.
    describe('the window', () => {
        const footer = (): HTMLElement => document.querySelector('.modal-footer-actions') as HTMLElement;
        const body = (): HTMLElement => document.querySelector('.modal-body') as HTMLElement;

        it("puts the link form's button in the footer, beside Close", async () => {
            await renderShare(answer({ ...PREVIEW, saved: true, onList: true }));

            expect(within(footer()).getByRole('button', { name: 'Copy Link' })).toBeInTheDocument();
            expect(within(body()).queryByRole('button', { name: 'Copy Link' })).toBeNull();
            expect(within(footer()).getByRole('button', { name: 'Close' })).toBeInTheDocument();
        });

        it("puts the file form's Save File in the footer in its place", async () => {
            await renderShare();
            await chooseFile();

            expect(within(footer()).getByRole('button', { name: 'Save File' })).toBeInTheDocument();
            expect(within(footer()).queryByRole('button', { name: SAVE_AND_COPY })).toBeNull();
            expect(within(body()).queryByRole('button', { name: 'Save File' })).toBeNull();
        });

        it('offers no link button when there is no storefront to link to', async () => {
            await renderShare(undefined, { isEds: false });

            expect(within(footer()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Close']);
        });

        it('holds the height it opens at through a change of form', async () => {
            await renderShare();
            const dialog = screen.getByRole('dialog');
            expect(dialog).toHaveClass('is-locked');

            await chooseFile();

            expect(screen.getByRole('dialog')).toBe(dialog);
            expect(dialog).toHaveClass('is-locked');
        });

        it('keeps the button the width of its widest label, so Close never moves', async () => {
            await renderShare();
            const sizers = Array.from(footer().querySelectorAll('.modal-button-sizer')).map((s) => s.textContent);

            expect(sizers).toEqual(expect.arrayContaining(['Copy Link', SAVE_AND_COPY, 'Copied', 'Save File']));
        });
    });

    it('closes from the Close button', async () => {
        const { props } = await renderShare();
        await click('Close');
        expect(props.onClose).toHaveBeenCalled();
    });
});
