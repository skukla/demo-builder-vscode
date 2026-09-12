/**
 * The same dialog as the dashboard's "Change source" door: its own title and
 * lead, the same-kind rule, no shipped template, the update-remembered box,
 * and the change commit.
 */

import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { JEN, READ, button, click, mockRequest, probeWith, renderModal, resetModalMocks } from './AddDemoModal.testUtils';

function renderChange(currentKind: 'eds' | 'headless' = 'eds') {
    return renderModal({ mode: 'change', currentKind });
}

describe('AddDemoModal — change mode', () => {
    beforeEach(resetModalMocks);

    it('opens with the change words', () => {
        renderChange();
        expect(screen.getByRole('heading', { name: 'Change the demo source' })).toBeInTheDocument();
        expect(screen.getByText(/Point this project at another copy of its demo/)).toBeInTheDocument();
    });

    it('offers the update-remembered box, off, and commits a change with both answers', async () => {
        const { props } = renderChange();
        await probeWith({ success: true, result: READ });

        const box = screen.getByTestId('update-remembered').querySelector('input') as HTMLInputElement;
        expect(box.checked).toBe(false);
        expect(button('Change source')).toHaveAttribute('aria-disabled', 'false');

        mockRequest.mockResolvedValueOnce({
            success: true,
            result: { demo: JEN, previous: { owner: 'old', repo: 'demo' } },
        });
        await click('Change source');

        expect(mockRequest).toHaveBeenLastCalledWith(
            'change-demo-source',
            expect.objectContaining({ keepCopy: true, updateRemembered: false }),
        );
        expect(props.onDemoAdded).toHaveBeenCalledWith(JEN);
        expect(props.onClose).toHaveBeenCalled();
    });

    it('refuses a demo of the other kind, naming what the project is built on', async () => {
        renderChange('headless');
        await probeWith({ success: true, result: READ });

        expect(screen.getByText('This demo is a different kind of storefront')).toBeInTheDocument();
        expect(screen.getByText('This project is built on a headless demo; pick a demo of the same kind.')).toBeInTheDocument();
        expect(button('Change source')).toHaveAttribute('aria-disabled', 'true');
        expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('will not point a project at a demo we ship', async () => {
        renderChange();
        await probeWith({
            success: true,
            result: { outcome: 'shipped', shippedPackageId: 'starter', fullName: 'adobe-commerce/boilerplate-b2b-template' },
        });

        expect(screen.getByTestId('shipped-notice')).toHaveTextContent("A project can't be pointed at a demo we ship");
        expect(button('Change source')).toHaveAttribute('aria-disabled', 'true');
    });

    it('shows the change failure inside the dialog and stays open', async () => {
        const { props } = renderChange();
        await probeWith({ success: true, result: READ });
        mockRequest.mockResolvedValueOnce({ success: false, error: 'This project is built on an Edge Delivery demo; pick a demo of the same kind.' });
        await click('Change source');
        expect(screen.getByTestId('add-error')).toHaveTextContent('Not changed');
        expect(props.onClose).not.toHaveBeenCalled();
    });
});
