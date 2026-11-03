/**
 * The "Add a demo package" dialog, end to end over the mocked host: the link stage,
 * the found panel and its conditional controls, the refusals, the commits.
 */

import { act, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    JEN,
    READ,
    button,
    click,
    linkInput,
    mockRequest,
    probeWith,
    renderModal,
    resetModalMocks,
    typeLink,
    chooseWay,
    pushed,
    title,
    footerButtons,
} from './AddDemoModal.testUtils';

describe('AddDemoModal', () => {
    beforeEach(resetModalMocks);

    it('opens on the two ways in, "From a Link" picked, with only the link field below', () => {
        renderModal();
        expect(screen.getByRole('heading', { name: 'Add a Demo Package' })).toBeInTheDocument();
        expect(screen.getByText('Source')).toBeInTheDocument();
        expect(screen.getByTestId('add-demo-way-link')).toHaveTextContent('From a Link');
        expect(screen.getByTestId('add-demo-way-zip')).toHaveTextContent('From a Zip File');
        expect(linkInput()).toBeInTheDocument();
        // One form at a time (owner, 2026-09-14: the dialog showed both and was too busy).
        expect(screen.queryByTestId('zip-public')).not.toBeInTheDocument();
        expect(screen.queryByText(/Use a demo a colleague built/)).not.toBeInTheDocument();
        expect(button('Continue')).toHaveAttribute('aria-disabled', 'true');
        expect(button('Back')).toHaveAttribute('aria-disabled', 'true');
    });

    it('does not list the demos already added: they are cards on the Welcome step behind it', () => {
        renderModal({ addedDemos: [JEN] });
        expect(screen.queryByText('Demos you have added')).not.toBeInTheDocument();
        expect(screen.queryByText(/Isle5 by Jen/)).not.toBeInTheDocument();
    });

    it('offers the zip way in add mode only; picked, the footer opens the picker, public unless the box is cleared', async () => {
        const change = renderModal({ mode: 'change', currentKind: 'eds' });
        expect(screen.queryByTestId('add-demo-way-zip')).not.toBeInTheDocument();
        expect(linkInput()).toBeInTheDocument();
        change.unmount();

        renderModal();
        await chooseWay('zip');
        expect(screen.queryByPlaceholderText('https://github.com/name/demo')).not.toBeInTheDocument();
        expect(screen.getByTestId('zip-public')).toHaveTextContent('Make the Repository Public');
        expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();

        // Public by default (owner, 2026-09-14).
        expect((screen.getByTestId('zip-public').querySelector('input') as HTMLInputElement).checked).toBe(true);
        mockRequest.mockResolvedValueOnce({ success: true, result: { cancelled: true } });
        await click('Choose a Zip File');
        expect(mockRequest).toHaveBeenLastCalledWith('import-storefront-zip', { isPrivate: false });

        fireEvent.click(screen.getByTestId('zip-public').querySelector('input') as HTMLInputElement);
        mockRequest.mockResolvedValueOnce({ success: false, error: 'This zip is not an Edge Delivery storefront: it has no head.html.' });
        await click('Choose a Zip File');
        expect(mockRequest).toHaveBeenLastCalledWith('import-storefront-zip', { isPrivate: true });
        // The failure replaces the form (owner, 2026-09-14), and Back returns to it.
        expect(title("Couldn't Add Zip File").innerHTML).toContain('text-negative');
        expect(screen.getByTestId('zip-error')).toHaveTextContent('it has no head.html');
        expect(footerButtons()).toEqual(['Close', 'Back']);
        expect(screen.queryByTestId('zip-public')).not.toBeInTheDocument();
        await click('Back');
        expect(screen.getByTestId('zip-public')).toBeInTheDocument();

        await chooseWay('link');
        expect(linkInput()).toBeInTheDocument();
    });

    it('offers to add the demo from a repository the account already has by that name', async () => {
        renderModal();
        await chooseWay('zip');
        mockRequest.mockResolvedValueOnce({
            success: false,
            code: 'REPO_EXISTS',
            error: 'Your GitHub account already has a repository named citisignal-b2b-summit.',
            existing: { owner: 'steve', repo: 'citisignal-b2b-summit' },
        });
        await click('Choose a Zip File');
        expect(screen.getByTestId('zip-error')).toHaveTextContent('already has a repository named citisignal-b2b-summit');
        // A choice, not a failure (owner, 2026-09-15): warning icon and words, not error.
        expect(title('Repository Name Already Exists').innerHTML).toContain('text-notice');
        expect(title('Repository Name Already Exists').innerHTML).not.toContain('text-negative');
        expect(screen.queryByRole('heading', { name: "Couldn't Add Zip File" })).not.toBeInTheDocument();
        // The way forward is the footer's main button, last.
        expect(footerButtons()).toEqual(['Cancel', 'Back', 'Add from Repository']);

        mockRequest.mockResolvedValueOnce({ success: true, result: { ...READ, fullName: 'steve/citisignal-b2b-summit' } });
        await click('Add from Repository');

        expect(mockRequest).toHaveBeenLastCalledWith('probe-shared-demo', { owner: 'steve', repo: 'citisignal-b2b-summit' });
        expect(screen.getByText('Package Details')).toBeInTheDocument();
    });

    it('says when a link is already added, whatever its case', () => {
        renderModal({ addedDemos: [JEN] });
        typeLink('https://github.com/Jen/ISLE5-demo');
        expect(screen.getByTestId('spectrum-textfield-error')).toHaveTextContent("You've already added this demo.");
        expect(button('Continue')).toHaveAttribute('aria-disabled', 'true');
    });

    it('shows what it found, with no copy offered, then adds', async () => {
        const { props } = renderModal();
        await probeWith({ success: true, result: READ });

        expect(screen.getByText('Package Details')).toBeInTheDocument();
        // The name is filled in, not a grey placeholder that reads as read-only (owner, 2026-09-15).
        const name = screen.getByLabelText('Demo Name', { selector: 'input' }) as HTMLInputElement;
        expect(name.value).toBe('Isle5 Demo');
        expect(name).not.toHaveAttribute('placeholder');
        expect(screen.getByTestId('found-Type')).toHaveTextContent('Edge Delivery');
        expect(screen.getByTestId('found-Pages')).toHaveTextContent('12 published');
        // One row per level, labelled on the left like every other row (owner, 2026-09-14).
        expect(screen.getByTestId('found-Website')).toHaveTextContent('isle5');
        expect(screen.getByTestId('found-Store')).toHaveTextContent('isle5_store');
        expect(screen.getByTestId('found-Store View')).toHaveTextContent('isle5_us');
        expect(screen.getByTestId('found-Company (B2B) Features')).toHaveTextContent('On');
        expect(screen.queryByTestId('b2b-switch')).not.toBeInTheDocument();
        // The copy was removed 2026-09-14 (step 11): the card reads from the link.
        expect(screen.queryByText(/own copy/)).not.toBeInTheDocument();

        // A description the card carries (owner, 2026-09-14: an added card had none).
        const description = screen.getByTestId('demo-description');
        fireEvent.change(description.querySelector('textarea') ?? description, { target: { value: 'Luxury B2C demo' } });

        mockRequest.mockResolvedValueOnce({ success: true, result: { demo: JEN } });
        await click('Add Demo Package');

        expect(mockRequest).toHaveBeenLastCalledWith('add-shared-demo', {
            demo: expect.objectContaining({ description: 'Luxury B2C demo', source: { owner: 'jen', repo: 'isle5-demo', branch: 'main' } }),
        });
        expect(mockRequest.mock.calls.at(-1)?.[1].demo).not.toHaveProperty('createdFromZip');
        expect(props.onDemoAdded).toHaveBeenCalledWith(JEN);
        expect(props.onClose).toHaveBeenCalled();
    });

    it("fills the description in from the demo's own file, as editable text, not a grey placeholder", async () => {
        renderModal();
        await probeWith({
            success: true,
            result: { ...READ, description: { kind: 'demo', version: 1, name: 'Isle5', description: 'Luxury B2C demo from the file' } },
        });

        const description = screen.getByLabelText('Description', { selector: 'textarea' }) as HTMLTextAreaElement;
        expect(description.value).toBe('Luxury B2C demo from the file');
        expect(description).not.toHaveAttribute('placeholder');
    });

    it('asks about company features only when the probe could not tell', async () => {
        renderModal();
        await probeWith({ success: true, result: { ...READ, b2b: 'unknown', b2bSource: undefined } });
        expect(screen.getByTestId('b2b-switch')).toBeInTheDocument();
        expect(screen.getByText(/Couldn't detect B2B features/)).toBeInTheDocument();
        expect(screen.queryByTestId('found-Company (B2B) Features')).not.toBeInTheDocument();
    });

    it('refuses a repository that is not a demo, naming what is missing', async () => {
        renderModal();
        await probeWith({
            success: true,
            result: { ...READ, kind: 'not-a-storefront', missing: ['scripts/scripts.js'], warnings: [] },
        });
        expect(title("Unsupported Demo").innerHTML).toContain('text-negative');
        expect(screen.getByText(/missing scripts\/scripts.js/)).toBeInTheDocument();
        // Nothing to go on to, so no main button shown off beside Back.
        expect(footerButtons()).toEqual(['Close', 'Back']);
        expect(button('Back')).toHaveAttribute('aria-disabled', 'false');
    });

    it('says to sign in to GitHub first, not that the link is not a demo, when there is no session', async () => {
        renderModal();
        await probeWith({ success: false, error: 'Sign In to GitHub to read this demo.', needsAuth: 'github' });
        expect(title('Sign In to GitHub First').innerHTML).toContain('text-notice');
        expect(screen.getByText(/Sign in to GitHub in VS Code/)).toBeInTheDocument();
        expect(screen.queryByText("Unsupported Demo")).not.toBeInTheDocument();
        expect(footerButtons()).toEqual(['Close', 'Back']);
    });

    // A read that did not finish says nothing about the demo.
    it('says the storefront could not be read when the read fails, not that it is no demo', async () => {
        renderModal();
        await probeWith({ success: false, error: 'GitHub did not answer.' });
        expect(title("Couldn't Read Storefront").innerHTML).toContain('text-negative');
        expect(screen.getByText('GitHub did not answer.')).toBeInTheDocument();
        expect(screen.queryByText("Unsupported Demo")).not.toBeInTheDocument();
    });

    it('says what to do when the read fails with no reason, without repeating the title', async () => {
        renderModal();
        await probeWith({ success: false });
        expect(title("Couldn't Read Storefront")).toBeInTheDocument();
        expect(screen.getByTestId('probe-refused')).toHaveTextContent(/^Check the link and try again\.$/);
    });

    it('says the same when GitHub answered that the repository cannot be read', async () => {
        renderModal();
        await probeWith({ success: true, result: { outcome: 'unreadable', reason: 'No such repository.' } });
        expect(title("Couldn't Read Storefront")).toBeInTheDocument();
        expect(screen.getByText('No such repository.')).toBeInTheDocument();
        expect(footerButtons()).toEqual(['Close', 'Back']);
    });

    it('goes back from a refusal to the link, still filled in', async () => {
        renderModal();
        await probeWith({ success: false, error: 'GitHub did not answer.' });
        await click('Back');
        expect(title('Add a Demo Package')).toBeInTheDocument();
        expect(linkInput()).toHaveValue('https://github.com/jen/isle5-demo');
    });

    it('lists a warning about the demo as a note under what was found, not as bullets', async () => {
        renderModal();
        await probeWith({ success: true, result: { ...READ, warnings: ['The content site publishes no index.'] } });
        const warnings = screen.getByTestId('found-warnings');
        expect(warnings.querySelector('ul')).toBeNull();
        expect(screen.getByText('The content site publishes no index.')).toHaveClass('add-demo-note');
    });

    it('offers our own card when the link is one of our templates', async () => {
        const { props } = renderModal();
        await probeWith({
            success: true,
            result: { outcome: 'shipped', shippedPackageId: 'starter', fullName: 'adobe-commerce/boilerplate-b2b-template' },
        });
        expect(title('This is the demo behind Starter (B2B + B2C)').innerHTML).toContain('text-notice');
        expect(screen.getByTestId('shipped-notice')).toHaveTextContent('Use the Starter (B2B + B2C) card instead');
        expect(screen.getByTestId('shipped-notice').querySelector('.inline-notice')).toBeNull();
        expect(footerButtons()).toEqual(['Cancel', 'Back', 'Use Starter (B2B + B2C)']);
        await click('Use Starter (B2B + B2C)');
        expect(props.onUseShipped).toHaveBeenCalledWith('starter');
        expect(props.onClose).toHaveBeenCalled();
    });

    it('still reads as a sentence when the template belongs to a card it cannot name', async () => {
        renderModal({ packages: [] });
        await probeWith({
            success: true,
            result: { outcome: 'shipped', shippedPackageId: 'starter', fullName: 'adobe-commerce/boilerplate-b2b-template' },
        });
        expect(title('Demo Already Available')).toBeInTheDocument();
        expect(screen.getByTestId('shipped-notice')).toHaveTextContent('Use its card instead');
    });

    it('offers to start a project from a bundle in the footer, before the main button', async () => {
        renderModal();
        await chooseWay('zip');
        const setup = { version: 1, settings: {} };
        mockRequest.mockResolvedValueOnce({ success: true, result: { owner: 'jen', repo: 'isle5-demo', setup } });
        mockRequest.mockResolvedValueOnce({ success: true, result: READ });
        await click('Choose a Zip File');

        expect(screen.getByTestId('bundle-setup')).toHaveClass('add-demo-note');
        expect(screen.getByTestId('bundle-setup')).toHaveTextContent('This bundle also carries setup');
        expect(footerButtons()).toEqual(['Cancel', 'Back', 'Start a Project with It', 'Add Demo Package']);
    });

    it('shows the add failure inside the dialog and stays open', async () => {
        const { props } = renderModal();
        await probeWith({ success: true, result: READ });
        mockRequest.mockResolvedValueOnce({ success: false, error: 'The settings could not be saved.' });
        await click('Add Demo Package');
        expect(title("Couldn't Add Demo").innerHTML).toContain('text-negative');
        expect(screen.getByTestId('add-error')).toHaveTextContent(/settings could not be saved/);
        expect(props.onClose).not.toHaveBeenCalled();
        // The error view replaces the form; Back returns to it, still filled in.
        expect(screen.queryByTestId('demo-description')).not.toBeInTheDocument();
        await click('Back');
        expect(screen.getByTestId('demo-description')).toBeInTheDocument();
    });

    it("takes a demo's site address and probes the repository it names", async () => {
        renderModal();
        mockRequest.mockResolvedValueOnce({ success: true, result: READ });
        typeLink('https://main--isle5-demo--jen.aem.live');
        await click('Continue');
        expect(mockRequest).toHaveBeenCalledWith('probe-shared-demo', { owner: 'jen', repo: 'isle5-demo' });
        expect(screen.getByTestId('found-Code')).toHaveTextContent('github.com/jen/isle5-demo');
    });

    it('mounts nothing while closed', () => {
        renderModal({ isOpen: false });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});

describe('AddDemoModal — while reading', () => {
    beforeEach(resetModalMocks);

    // Reading what it will show: only the title, the spinner and the way out.
    it('shows only the title, a spinner and Cancel', async () => {
        let release: (value: unknown) => void = () => {};
        mockRequest.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
        renderModal();
        typeLink('https://github.com/jen/isle5-demo');
        await click('Continue');

        expect(title('Add a Demo Package')).toBeInTheDocument();
        expect(screen.getByRole('dialog').querySelector('.modal-wait')).not.toBeNull();
        expect(screen.queryByText('Reading the storefront')).not.toBeInTheDocument();
        expect(screen.queryByText('jen/isle5-demo')).not.toBeInTheDocument();
        expect(screen.queryByText(/what kind of storefront it is/)).not.toBeInTheDocument();
        expect(footerButtons()).toEqual(['Cancel']);

        // Let the probe finish inside act, so the found panel's render is not stray.
        await act(async () => {
            release({ success: true, result: READ });
        });
    });

    it('shows the add is under way instead of a frozen form', async () => {
        // Owner, 2026-09-14: pressing Add showed nothing while the host worked.
        renderModal();
        await probeWith({ success: true, result: READ });
        let release: (value: unknown) => void = () => {};
        mockRequest.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
        await click('Add Demo Package');

        expect(screen.getByText('Adding the Demo Package')).toBeInTheDocument();
        expect(screen.queryByTestId('demo-description')).not.toBeInTheDocument();

        await act(async () => {
            release({ success: true, result: { demo: JEN } });
        });
    });

    it('shows the push is under way while the zip becomes a repository', async () => {
        // This spinner used to render only on the found stage, which the dialog
        // reaches AFTER the push: a minute-long upload showed a frozen form.
        let release: (value: unknown) => void = () => {};
        mockRequest.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
        renderModal();
        await chooseWay('zip');
        await click('Choose a Zip File');

        expect(screen.getByText('Creating your repository from the zip')).toBeInTheDocument();
        // The step and its detail say enough; no sentence under them (owner, 2026-09-15).
        expect(screen.queryByText(/Unpacking the files/)).not.toBeInTheDocument();
        expect(screen.queryByTestId('add-demo-way-zip')).not.toBeInTheDocument();

        // The host names each step as it runs (owner, 2026-09-14: more granular reporting).
        await act(async () => {
            pushed.get('storefront-zip-progress')?.({ message: 'Pushing files', detail: '1,264 of 3,475' });
        });
        expect(screen.getByText('Pushing files')).toBeInTheDocument();
        expect(screen.getByText('1,264 of 3,475')).toBeInTheDocument();

        await act(async () => {
            release({ success: true, result: { cancelled: true } });
        });
        expect(screen.getByTestId('add-demo-way-zip')).toBeInTheDocument();
    });
});
