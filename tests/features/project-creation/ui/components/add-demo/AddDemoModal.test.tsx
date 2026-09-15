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
} from './AddDemoModal.testUtils';

describe('AddDemoModal', () => {
    beforeEach(resetModalMocks);

    it('opens on the two ways in, "From a link" picked, with only the link field below', () => {
        renderModal();
        expect(screen.getByRole('heading', { name: 'Add a demo package' })).toBeInTheDocument();
        expect(screen.getByText('Where is the demo?')).toBeInTheDocument();
        expect(screen.getByTestId('add-demo-way-link')).toHaveTextContent('From a link');
        expect(screen.getByTestId('add-demo-way-zip')).toHaveTextContent('From a zip file');
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
        expect(screen.getByTestId('zip-public')).toHaveTextContent('Make the repository public');
        expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();

        // Public by default (owner, 2026-09-14).
        expect((screen.getByTestId('zip-public').querySelector('input') as HTMLInputElement).checked).toBe(true);
        mockRequest.mockResolvedValueOnce({ success: true, result: { cancelled: true } });
        await click('Choose a zip file');
        expect(mockRequest).toHaveBeenLastCalledWith('import-storefront-zip', { isPrivate: false });

        fireEvent.click(screen.getByTestId('zip-public').querySelector('input') as HTMLInputElement);
        mockRequest.mockResolvedValueOnce({ success: false, error: 'This zip is not an Edge Delivery storefront: it has no head.html.' });
        await click('Choose a zip file');
        expect(mockRequest).toHaveBeenLastCalledWith('import-storefront-zip', { isPrivate: true });
        // The house error view replaces the form (owner, 2026-09-14), and Back returns to it.
        expect(screen.getByTestId('zip-error')).toHaveTextContent("We couldn't add this zip");
        expect(screen.getByTestId('zip-error')).toHaveTextContent('it has no head.html');
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
        await click('Choose a zip file');
        expect(screen.getByTestId('zip-error')).toHaveTextContent('already has a repository named citisignal-b2b-summit');

        mockRequest.mockResolvedValueOnce({ success: true, result: { ...READ, fullName: 'steve/citisignal-b2b-summit' } });
        await click('Add it from that repository');

        expect(mockRequest).toHaveBeenLastCalledWith('probe-shared-demo', { owner: 'steve', repo: 'citisignal-b2b-summit' });
        expect(screen.getByText('Package details')).toBeInTheDocument();
    });

    it('says when a link is already added, whatever its case', () => {
        renderModal({ addedDemos: [JEN] });
        typeLink('https://github.com/Jen/ISLE5-demo');
        expect(screen.getByTestId('spectrum-textfield-error')).toHaveTextContent("You've already added this demo.");
        expect(button('Continue')).toHaveAttribute('aria-disabled', 'true');
    });

    it('shows what it found, with the copy box on and naming the account, then adds', async () => {
        const { props } = renderModal();
        await probeWith({ success: true, result: READ });

        expect(screen.getByText('Package details')).toBeInTheDocument();
        expect(screen.getByTestId('found-Type')).toHaveTextContent('Edge Delivery');
        expect(screen.getByTestId('found-Pages')).toHaveTextContent('12 published');
        // One row per level, labelled on the left like every other row (owner, 2026-09-14).
        expect(screen.getByTestId('found-Website')).toHaveTextContent('isle5');
        expect(screen.getByTestId('found-Store')).toHaveTextContent('isle5_store');
        expect(screen.getByTestId('found-Store view')).toHaveTextContent('isle5_us');
        expect(screen.getByTestId('found-Company (B2B) features')).toHaveTextContent('On');
        expect(screen.queryByTestId('b2b-switch')).not.toBeInTheDocument();
        const keep = screen.getByTestId('keep-copy').querySelector('input') as HTMLInputElement;
        expect(keep.checked).toBe(true);
        expect(screen.getByTestId('keep-copy')).toHaveTextContent('Keep my own copy of the code');
        expect(screen.getByText('Saved to your GitHub account, steve. Your projects keep working if the original changes.')).toBeInTheDocument();

        // A description the card carries (owner, 2026-09-14: an added card had none).
        const description = screen.getByTestId('demo-description');
        fireEvent.change(description.querySelector('textarea') ?? description, { target: { value: 'Luxury B2C demo' } });

        mockRequest.mockResolvedValueOnce({ success: true, result: { demo: JEN } });
        await click('Add demo package');

        expect(mockRequest).toHaveBeenLastCalledWith(
            'add-shared-demo',
            expect.objectContaining({ keepCopy: true, demo: expect.objectContaining({ description: 'Luxury B2C demo' }) }),
        );
        expect(props.onDemoAdded).toHaveBeenCalledWith(JEN);
        expect(props.onClose).toHaveBeenCalled();
    });

    it('asks about company features only when the probe could not tell', async () => {
        renderModal();
        await probeWith({ success: true, result: { ...READ, b2b: 'unknown', b2bSource: undefined } });
        expect(screen.getByTestId('b2b-switch')).toBeInTheDocument();
        expect(screen.getByText(/We couldn't tell whether this demo uses company accounts/)).toBeInTheDocument();
        expect(screen.queryByTestId('found-Company (B2B) features')).not.toBeInTheDocument();
    });

    it("hides the copy box for the SC's own repository and marks an existing fork as already kept", async () => {
        const { unmount } = renderModal();
        await probeWith({ success: true, result: { ...READ, viewer: { login: 'jen', ownsRepo: true } } });
        expect(screen.queryByTestId('keep-copy')).not.toBeInTheDocument();
        unmount();

        renderModal();
        await probeWith({
            success: true,
            result: { ...READ, viewer: { login: 'steve', ownsRepo: false, existingFork: 'steve/isle5-demo' } },
        });
        expect(screen.getByTestId('keep-copy')).toHaveTextContent('You already have a copy at steve/isle5-demo. It will be used.');
    });

    it('refuses a repository that is not a demo, naming what is missing', async () => {
        renderModal();
        await probeWith({
            success: true,
            result: { ...READ, kind: 'not-a-storefront', missing: ['scripts/scripts.js'], warnings: [] },
        });
        expect(screen.getByText("This doesn't look like a demo we can build on")).toBeInTheDocument();
        expect(screen.getByText(/missing scripts\/scripts.js/)).toBeInTheDocument();
        expect(button('Add demo package')).toHaveAttribute('aria-disabled', 'true');
        expect(button('Back')).toHaveAttribute('aria-disabled', 'false');
    });

    it('says to sign in to GitHub first, not that the link is not a demo, when there is no session', async () => {
        renderModal();
        await probeWith({ success: false, error: 'Sign in to GitHub to read this demo.', needsAuth: 'github' });
        expect(screen.getByText('Sign in to GitHub first')).toBeInTheDocument();
        expect(screen.getByText(/Sign in to GitHub in VS Code/)).toBeInTheDocument();
        expect(screen.queryByText("This doesn't look like a demo we can build on")).not.toBeInTheDocument();
        expect(button('Add demo package')).toHaveAttribute('aria-disabled', 'true');
    });

    it('offers our own card when the link is one of our templates', async () => {
        const { props } = renderModal();
        await probeWith({
            success: true,
            result: { outcome: 'shipped', shippedPackageId: 'starter', fullName: 'adobe-commerce/boilerplate-b2b-template' },
        });
        expect(screen.getByTestId('shipped-notice')).toHaveTextContent('This is the demo behind Starter (B2B + B2C)');
        await click('Use Starter (B2B + B2C)');
        expect(props.onUseShipped).toHaveBeenCalledWith('starter');
        expect(props.onClose).toHaveBeenCalled();
    });

    it('shows the add failure inside the dialog and stays open', async () => {
        const { props } = renderModal();
        await probeWith({ success: true, result: READ });
        mockRequest.mockResolvedValueOnce({ success: false, error: "We couldn't make your own copy of this demo." });
        await click('Add demo package');
        expect(screen.getByTestId('add-error')).toHaveTextContent('Not added');
        expect(screen.getByTestId('add-error')).toHaveTextContent(/own copy/);
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

    it('says what it is reading and what it is checking for', async () => {
        let release: (value: unknown) => void = () => {};
        mockRequest.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
        renderModal();
        typeLink('https://github.com/jen/isle5-demo');
        await click('Continue');

        expect(screen.getByText('Reading the storefront')).toBeInTheDocument();
        expect(screen.getByText('jen/isle5-demo')).toBeInTheDocument();
        expect(screen.getByText(/what kind of storefront it is, its store codes/)).toBeInTheDocument();

        // Let the probe finish inside act, so the found panel's render is not stray.
        await act(async () => {
            release({ success: true, result: READ });
        });
    });

    it('shows the add is under way, naming the copy it makes, instead of a frozen form', async () => {
        // Owner, 2026-09-14: pressing Add showed nothing for a second while the
        // host forked the repository.
        renderModal();
        await probeWith({ success: true, result: READ });
        let release: (value: unknown) => void = () => {};
        mockRequest.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
        await click('Add demo package');

        expect(screen.getByText('Adding the demo package')).toBeInTheDocument();
        expect(screen.getByText('Making your own copy of the code in your GitHub account.')).toBeInTheDocument();
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
        await click('Choose a zip file');

        expect(screen.getByText('Creating your repository from the zip')).toBeInTheDocument();
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
