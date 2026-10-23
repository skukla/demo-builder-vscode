/**
 * The Share dialog (owner, 2026-10-22: "I do want the merged share dialog").
 * One dialog replaces Export and Save as demo package. It asks how the demo
 * travels first, as two plain options with one line on the chosen one. The link
 * form is the link and one button, the "Also show it on my Welcome step" box,
 * the name and description behind a quiet link, only the checks that need the
 * SC, and the undo. The button
 * says whether the press will write: "Save details and copy link" until the
 * details are in the repository (and again after an edit), then "Copy link".
 * The file form is unchanged from Export.
 */

import { act, fireEvent, screen } from '@testing-library/react';
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

const LINK_LINE = 'For colleagues who can open your GitHub. They paste it into "Add a demo package" and get your later changes.';
const SAVE_AND_COPY = 'Save details and copy link';

describe('ShareModal', () => {
    beforeEach(resetShareMocks);

    it('opens under its own title on the link form, with the two ways to hand over', async () => {
        await renderShare();
        expect(screen.getByRole('heading', { name: 'Share Demo' })).toBeInTheDocument();
        expect(screen.getByTestId('share-form')).toHaveTextContent('Send a link');
        expect(screen.getByTestId('share-form')).toHaveTextContent('Send a file');
        expect(screen.getByTestId('share-form')).toHaveTextContent(LINK_LINE);
        expect(screen.queryByText('What to include')).not.toBeInTheDocument();
    });

    it('the line under the choice follows it', async () => {
        await renderShare();
        await chooseFile();
        expect(screen.getByTestId('share-form')).toHaveTextContent("For colleagues who can't. One zip, no later changes.");
        expect(screen.getByTestId('share-form')).not.toHaveTextContent(LINK_LINE);
    });

    it('while the storefront is being read, the spinner is the whole body', () => {
        renderSharePending();
        expect(screen.getByText('Checking the storefront')).toBeInTheDocument();
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
        await renderShare({ success: false, error: 'Sign in to GitHub first.' });
        expect(screen.getByTestId('share-link-failed')).toHaveTextContent('Sign in to GitHub first.');
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

            await click('Copy link');

            expect(mockWriteText).toHaveBeenCalledWith(LINK);
            expect(sent('saveDemoPackage')).toHaveLength(0);
            expect(button('Copied')).toBeInTheDocument();
        });

        it('a storefront without them: the button says it saves, writes the prefilled details with the card, then copies', async () => {
            await renderShare();
            // A button labelled only "Copy link" must not write.
            expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
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

            await click('Copy link');

            expect(sent('saveDemoPackage')).toHaveLength(1);
            expect(mockWriteText).toHaveBeenCalledTimes(2);
        });

        it('a write that fails copies nothing, says so, and keeps the save wording', async () => {
            await renderShare();
            mockRequest.mockResolvedValueOnce({ success: false, error: 'GitHub refused the write.' });

            await click(SAVE_AND_COPY);

            expect(mockWriteText).not.toHaveBeenCalled();
            expect(screen.getByTestId('share-error')).toHaveTextContent('GitHub refused the write.');
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
        it('shows only the ones that need the SC, with the republish hint', async () => {
            await renderShare();
            expect(screen.getByTestId('share-link-form')).toHaveTextContent('Before you send it');
            expect(screen.getByTestId('package-check-index')).toHaveTextContent('Republish, then save again.');
            expect(screen.queryByTestId('package-check-repository')).not.toBeInTheDocument();
        });

        it('says nothing when every check passes', async () => {
            const allOk = PREVIEW.checks.map((check) => ({ ...check, ok: true }));
            await renderShare(answer({ ...PREVIEW, checks: allOk }));
            // Positive control: the form itself rendered.
            expect(screen.getByTestId('share-link')).toHaveTextContent(LINK);
            expect(screen.queryByText('Before you send it')).not.toBeInTheDocument();
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
            expect(button('Copy link')).toBeInTheDocument();

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
            expect(button(SAVE_AND_COPY)).toBeDisabled();
        });
    });

    describe('"Also show it on my Welcome step"', () => {
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
            expect(button('Copy link')).toBeInTheDocument();

            fireEvent.click(welcomeBox());

            expect(button(SAVE_AND_COPY)).toBeInTheDocument();
        });
    });

    describe('the undo', () => {
        it('is not offered before anything was saved', async () => {
            await renderShare();
            expect(screen.queryByRole('button', { name: 'Remove the details from my repository' })).not.toBeInTheDocument();
        });

        it('removes the details and the card, says what it undid, and the button goes back to saving', async () => {
            await renderShare(answer({ ...PREVIEW, saved: true, onList: true }));
            mockRequest.mockResolvedValueOnce(answer(REMOVED));

            await click('Remove the details from my repository');

            expect(mockRequest).toHaveBeenLastCalledWith('removeDemoPackage');
            expect(screen.getByTestId('share-removed')).toHaveTextContent(
                'The details are out of your repository and the card is off your Welcome step.',
            );
            expect(button(SAVE_AND_COPY)).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Remove the details from my repository' })).not.toBeInTheDocument();
        });

        it('is offered for a card on the list even when the file is not ours', async () => {
            await renderShare(answer({ ...PREVIEW, saved: false, onList: true }));
            expect(button('Remove the details from my repository')).toBeInTheDocument();
        });
    });

    describe('the file form', () => {
        it('ticks setup and storefront by default, saves one bundle through the host, and reports what and where', async () => {
            await renderShare();
            await chooseFile();
            expect(screen.getByText('What to include')).toBeInTheDocument();
            expect(partBox('part-setup').checked).toBe(true);
            expect(partBox('part-storefront').checked).toBe(true);
            mockRequest.mockResolvedValueOnce(
                answer({ path: '/Users/steve/bodea-demo-bundle.zip', fileCount: 813, bytes: 1_000, parts: ['setup', 'storefront'] }),
            );

            await click('Save file');

            expect(mockRequest).toHaveBeenLastCalledWith('exportDemoBundle', { setup: true, storefront: true });
            expect(screen.getByTestId('export-saved')).toHaveTextContent(
                'Saved setup and storefront (813 files) to /Users/steve/bodea-demo-bundle.zip',
            );
        });

        it('sends only the ticked parts and refuses none', async () => {
            await renderShare();
            await chooseFile();
            fireEvent.click(partBox('part-storefront'));
            mockRequest.mockResolvedValueOnce(answer({ path: '/p/x.json', fileCount: 1, parts: ['setup'] }));
            await click('Save file');
            expect(mockRequest).toHaveBeenLastCalledWith('exportDemoBundle', { setup: true, storefront: false });

            fireEvent.click(partBox('part-setup'));
            expect(button('Save file')).toBeDisabled();
            expect(screen.getByTestId('export-file-form')).toHaveTextContent('Tick at least one part.');
        });

        it('starts with the storefront off and disabled for a headless project, and shows a failure', async () => {
            await renderShare(undefined, { isEds: false });
            await chooseFile();
            expect(partBox('part-storefront').checked).toBe(false);
            expect(partBox('part-storefront').disabled).toBe(true);
            mockRequest.mockResolvedValueOnce({ success: false, error: 'Failed to download archive: HTTP 404' });
            await click('Save file');
            expect(screen.getByTestId('export-error')).toHaveTextContent('HTTP 404');
        });

        it('says nothing when the save dialog is dismissed', async () => {
            await renderShare();
            await chooseFile();
            mockRequest.mockResolvedValueOnce(answer({ cancelled: true }));
            await click('Save file');
            expect(screen.queryByTestId('export-saved')).not.toBeInTheDocument();
        });
    });

    it('closes from the Close button', async () => {
        const { props } = await renderShare();
        await click('Close');
        expect(props.onClose).toHaveBeenCalled();
    });
});
