/**
 * The "Add a demo" dialog, end to end over the mocked host: the link stage,
 * the found panel and its conditional controls, the refusals, the commits.
 */

import { act, screen } from '@testing-library/react';
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
} from './AddDemoModal.testUtils';

describe('AddDemoModal', () => {
    beforeEach(resetModalMocks);

    it('opens on the link stage with the accepted words and Continue disabled', () => {
        renderModal();
        expect(screen.getByRole('heading', { name: 'Add a demo' })).toBeInTheDocument();
        expect(screen.getByText(/Use a demo a colleague built/)).toBeInTheDocument();
        expect(linkInput()).toBeInTheDocument();
        expect(button('Continue')).toHaveAttribute('aria-disabled', 'true');
        expect(button('Back')).toHaveAttribute('aria-disabled', 'true');
    });

    it('lists the demos already added, and picking one selects it and closes', async () => {
        const { props } = renderModal({ addedDemos: [JEN] });
        expect(screen.getByText('Demos you have added')).toBeInTheDocument();
        await click(/Isle5 by Jen/);
        expect(props.onPickRemembered).toHaveBeenCalledWith(JEN);
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

        expect(screen.getByText('What we found in this demo')).toBeInTheDocument();
        expect(screen.getByTestId('found-Storefront')).toHaveTextContent('Edge Delivery');
        expect(screen.getByTestId('found-Pages')).toHaveTextContent('12 published pages');
        expect(screen.getByTestId('found-Store codes')).toHaveTextContent('isle5 · isle5_store · isle5_us');
        expect(screen.getByTestId('found-Company (B2B) features')).toHaveTextContent('On');
        expect(screen.queryByTestId('b2b-switch')).not.toBeInTheDocument();
        const keep = screen.getByTestId('keep-copy').querySelector('input') as HTMLInputElement;
        expect(keep.checked).toBe(true);
        expect(screen.getByText(/Your copy goes to your GitHub account \(steve\)/)).toBeInTheDocument();

        mockRequest.mockResolvedValueOnce({ success: true, result: { demo: JEN } });
        await click('Add demo');

        expect(mockRequest).toHaveBeenLastCalledWith('add-shared-demo', expect.objectContaining({ keepCopy: true }));
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
        expect(screen.getByTestId('keep-copy')).toHaveTextContent('You already have your own copy at steve/isle5-demo');
    });

    it('refuses a repository that is not a demo, naming what is missing', async () => {
        renderModal();
        await probeWith({
            success: true,
            result: { ...READ, kind: 'not-a-storefront', missing: ['scripts/scripts.js'], warnings: [] },
        });
        expect(screen.getByText("This doesn't look like a demo we can build on")).toBeInTheDocument();
        expect(screen.getByText(/missing scripts\/scripts.js/)).toBeInTheDocument();
        expect(button('Add demo')).toHaveAttribute('aria-disabled', 'true');
        expect(button('Back')).toHaveAttribute('aria-disabled', 'false');
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
        await click('Add demo');
        expect(screen.getByTestId('add-error')).toHaveTextContent(/own copy/);
        expect(props.onClose).not.toHaveBeenCalled();
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

        expect(screen.getByText('Reading the demo…')).toBeInTheDocument();
        expect(screen.getByText('jen/isle5-demo')).toBeInTheDocument();
        expect(screen.getByText(/what kind of storefront it is, its store codes/)).toBeInTheDocument();

        // Let the probe finish inside act, so the found panel's render is not stray.
        await act(async () => {
            release({ success: true, result: READ });
        });
    });
});
