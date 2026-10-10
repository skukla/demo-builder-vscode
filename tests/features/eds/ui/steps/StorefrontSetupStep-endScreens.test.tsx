/**
 * StorefrontSetupStep — the two screens a run ends on: failed (Cancel/Retry)
 * and published (with or without warnings).
 *
 * Both are the shared StatusDisplay since EDS-8 (owner, 2026-10-09). They used
 * to be two view files of their own; these cases are those files' suites,
 * driven through the step, plus the sizing decision the switch introduced: the
 * screen sizes to its content inside a container that fills the pane, rather
 * than StatusDisplay's default fixed 350px box.
 *
 * Icons come from the jest.config.js module mapper. Every icon specifier maps
 * to ONE stub, so the icon is identified by the colour class it is given.
 */

import { fireEvent, screen } from '@testing-library/react';
import {
    pushComplete,
    pushError,
    renderStep,
    resetDriver,
    startPayloads,
} from './StorefrontSetupStep.driver.testUtils';

beforeEach(() => {
    resetDriver();
});

const HINT = 'Click Continue to proceed with project creation.';

function iconClass(container: HTMLElement): string {
    const icon = container.querySelector('svg');
    if (!icon) throw new Error('no icon rendered');
    return icon.getAttribute('class') ?? '';
}

/** The outer box StatusDisplay renders, read through the container it sits in. */
function endScreenBox(): { container: HTMLElement; box: HTMLElement; content: HTMLElement } {
    const container = screen.getByTestId('centered-feedback');
    const box = container.querySelector<HTMLElement>('.fade-transition > div');
    const content = box?.firstElementChild as HTMLElement | null;
    if (!box || !content) throw new Error('no StatusDisplay box rendered');
    return { container, box, content };
}

describe('StorefrontSetupStep — failed screen', () => {
    it('names the failure with a red alert', () => {
        const { container } = renderStep();
        pushError({ message: 'Pipeline stopped', error: 'HTTP 502' });

        expect(screen.getByText('Storefront Setup Failed')).toBeInTheDocument();
        expect(iconClass(container)).toBe('text-red-600');
    });

    it('shows the error detail instead of the message, centred', () => {
        renderStep();
        pushError({ message: 'Publish failed', error: 'HTTP 502' });

        expect(screen.getByText('HTTP 502')).toHaveClass('text-center');
        expect(screen.queryByText('Publish failed')).not.toBeInTheDocument();
    });

    // The old view carried a third fallback ('An error occurred during setup.')
    // that no push could reach: applyError always stores a message. This is
    // the line the SC actually sees when the push carries neither.
    it('says something when neither a detail nor a message arrived', () => {
        renderStep();
        pushError({ message: '', error: '' });

        expect(screen.getByText('An error occurred')).toBeInTheDocument();
    });

    it('offers Cancel then Retry, and Cancel goes back without restarting', () => {
        const { onBack } = renderStep();
        pushError({ message: 'Pipeline stopped', error: 'HTTP 502' });
        const startsBefore = startPayloads().length;

        const buttons = screen
            .getAllByRole('button')
            .map((button) => [button.textContent, button.getAttribute('data-variant')]);
        expect(buttons).toEqual([
            ['Cancel', 'secondary'],
            ['Retry', 'accent'],
        ]);

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onBack).toHaveBeenCalledTimes(1);
        expect(startPayloads()).toHaveLength(startsBefore);
    });

    it('Retry starts the run again and does not go back', () => {
        const { onBack } = renderStep();
        pushError({ message: 'Pipeline stopped', error: 'HTTP 502' });
        const startsBefore = startPayloads().length;

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(startPayloads()).toHaveLength(startsBefore + 1);
        expect(onBack).not.toHaveBeenCalled();
    });
});

describe('StorefrontSetupStep — published screen', () => {
    it('shows a clean publish with a green check and the Continue hint', () => {
        const { container } = renderStep();
        pushComplete({ message: 'Storefront setup completed successfully!' });

        expect(screen.getByText('Storefront Published')).toBeInTheDocument();
        expect(iconClass(container)).toBe('text-green-600');
        expect(screen.getByText(HINT)).toBeInTheDocument();
        expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('treats an empty warning list as a clean publish', () => {
        const { container } = renderStep();
        pushComplete({ message: 'done', warnings: [] });

        expect(screen.getByText('Storefront Published')).toBeInTheDocument();
        expect(iconClass(container)).toBe('text-green-600');
    });

    it('does not wear the green check when product pages will not work', () => {
        const { container } = renderStep();
        pushComplete({
            message: 'done',
            warnings: ['Product pages will not render', 'Search is not configured'],
        });

        expect(screen.getByText('Storefront Published, with warnings')).toBeInTheDocument();
        expect(iconClass(container)).toBe('text-orange-600');
    });

    it('lists each warning, in order, above the Continue hint', () => {
        renderStep();
        pushComplete({
            message: 'done',
            warnings: ['Product pages will not render', 'Search is not configured'],
        });

        const lines = [
            'Product pages will not render',
            'Search is not configured',
            HINT,
        ].map((text) => screen.getByText(text));
        lines.forEach((line, index) => {
            if (index === 0) return;
            const previous = lines[index - 1];
            expect(
                previous.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        });
    });
});

describe('StorefrontSetupStep — end screens centre in the pane', () => {
    const endings: Array<[string, () => void]> = [
        ['failed', () => pushError({ message: 'Pipeline stopped', error: 'HTTP 502' })],
        ['published', () => pushComplete({ message: 'done' })],
    ];

    it.each(endings)(
        'the %s screen sizes to its content inside a pane-filling container',
        (_name, end) => {
            renderStep();
            end();

            const { container, box, content } = endScreenBox();
            expect(container).toHaveAttribute('data-fill', 'true');
            expect(box.style.height).toBe('auto');
            expect(content.style.maxWidth).toBe('520px');
        },
    );
});
