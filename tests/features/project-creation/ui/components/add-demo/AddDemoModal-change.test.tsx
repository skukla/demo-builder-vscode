/**
 * The same dialog as the dashboard's "Change source" door: its own title and
 * lead, the same-kind rule, no shipped template, the update-demo-package box,
 * and the change commit.
 */

import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { JEN, READ, button, click, footerButtons, mockRequest, probeWith, renderModal, resetModalMocks, title } from './AddDemoModal.testUtils';

/** A change dialog for a project whose Welcome step has the Bodea demo package, unless `withPackage` is false. */
function renderChange(currentKind: 'eds' | 'headless' = 'eds', withPackage = true) {
    return renderModal({ mode: 'change', currentKind, ...(withPackage ? { demoPackageName: 'Bodea' } : {}) });
}

describe('AddDemoModal — change mode', () => {
    beforeEach(resetModalMocks);

    it('opens with the change words', () => {
        renderChange();
        expect(screen.getByRole('heading', { name: 'Change the Demo Source' })).toBeInTheDocument();
        expect(screen.getByText(/Point this project at another copy of its demo/)).toBeInTheDocument();
    });

    it('offers the update-demo-package box, ticked and named, and commits a change with both answers', async () => {
        const { props } = renderChange();
        await probeWith({ success: true, result: READ });

        expect(screen.getByTestId('update-demo-package')).toHaveTextContent('Also Update the Bodea Demo Package');
        const box = screen.getByTestId('update-demo-package').querySelector('input') as HTMLInputElement;
        expect(box.checked).toBe(true);
        expect(button('Change Source')).toHaveAttribute('aria-disabled', 'false');

        mockRequest.mockResolvedValueOnce({
            success: true,
            result: { demo: JEN, previous: { owner: 'old', repo: 'demo' } },
        });
        await click('Change Source');

        expect(mockRequest).toHaveBeenLastCalledWith('change-demo-source', {
            demo: expect.objectContaining({ source: { owner: 'jen', repo: 'isle5-demo', branch: 'main' } }),
            updateDemoPackage: true,
        });
        expect(props.onDemoAdded).toHaveBeenCalledWith(JEN);
        expect(props.onClose).toHaveBeenCalled();
    });

    it('offers no box when the Welcome step has no demo package for this demo, and updates none', async () => {
        renderChange('eds', false);
        await probeWith({ success: true, result: READ });

        expect(screen.queryByTestId('update-demo-package')).not.toBeInTheDocument();
        mockRequest.mockResolvedValueOnce({ success: true, result: { demo: JEN, previous: { owner: 'old', repo: 'demo' } } });
        await click('Change Source');

        expect(mockRequest).toHaveBeenLastCalledWith('change-demo-source', expect.objectContaining({ updateDemoPackage: false }));
    });

    it('refuses a demo of the other kind, naming what the project is built on', async () => {
        renderChange('headless');
        await probeWith({ success: true, result: READ });

        expect(title('This demo is a different kind of storefront').innerHTML).toContain('text-negative');
        expect(screen.getByText('This project uses a headless demo. Select a demo of the same type.')).toBeInTheDocument();
        expect(footerButtons()).toEqual(['Close', 'Back']);
        expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('will not point a project at a demo that is already available', async () => {
        renderChange();
        await probeWith({
            success: true,
            result: { outcome: 'shipped', shippedPackageId: 'starter', fullName: 'adobe-commerce/boilerplate-b2b-template' },
        });

        expect(title('This is the demo behind Starter (B2B + B2C)').innerHTML).toContain('text-notice');
        expect(screen.getByTestId('shipped-notice')).toHaveTextContent("A project can't point to a demo that's already available");
        expect(footerButtons()).toEqual(['Close', 'Back']);
    });

    it('shows the change failure inside the dialog and stays open', async () => {
        const { props } = renderChange();
        await probeWith({ success: true, result: READ });
        mockRequest.mockResolvedValueOnce({ success: false, error: 'This project uses an Edge Delivery demo. Select a demo of the same type.' });
        await click('Change Source');
        expect(title("Couldn't Change Source").innerHTML).toContain('text-negative');
        expect(props.onClose).not.toHaveBeenCalled();
    });
});
