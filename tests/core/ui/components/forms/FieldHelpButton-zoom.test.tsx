/**
 * The fullscreen screenshot overlay, and the events it has to steal.
 *
 * The overlay is portaled to document.body so it escapes the dialog's stacking
 * context — which means the dialog underneath is still listening. Every one of
 * its listeners is registered in the CAPTURE phase and calls
 * `stopImmediatePropagation`, so an Escape or a click that dismisses the zoom
 * never reaches the modal and takes the whole help dialog down with it.
 *
 * That is why the tests below assert on a spy listener rather than only on what
 * is visible: "the zoom closed" is true whether or not the dialog also closed,
 * and the second half is the part that regressed.
 */
import React from 'react';
import { renderWithProviders, fireEvent, waitFor } from '../../../../helpers/react-test-utils';
import { FieldHelpButton } from '@/core/ui/components/forms/FieldHelpButton';
import type { FieldHelp } from '@/types/webview';
import { openHelp } from './FieldHelpButton.testUtils';

const HELP: FieldHelp = {
    title: 'With Screenshots',
    steps: [
        { text: 'the only step', screenshot: 'step1.png', screenshotAlt: 'the shot of step one' },
    ],
};

/** Help whose step names no alt text, so the fallback has to supply one. */
const HELP_NO_ALT: FieldHelp = {
    title: 'With Screenshots',
    steps: [{ text: 'the only step', screenshot: 'step1.png' }],
};

/**
 * A capture-phase listener on document, registered AFTER the component's.
 *
 * Capture listeners on one node run in registration order, so this is reached
 * only if the overlay's own listener did not stop the event first — which makes
 * it a direct read of both the capture flag and the stopImmediatePropagation.
 */
function listenAfterTheOverlay(type: string) {
    const spy = jest.fn();
    document.addEventListener(type, spy, true);
    return {
        spy,
        dispose: () => document.removeEventListener(type, spy, true),
    };
}

async function openZoom(help = HELP) {
    const { baseElement } = renderWithProviders(
        <FieldHelpButton help={help} fieldLabel="Test Field" baseUri="vscode-webview://test" />,
    );
    await openHelp('the only step');

    const thumbnail = baseElement.querySelector('img.screenshot-thumbnail') as HTMLElement;
    fireEvent.click(thumbnail);
    await waitFor(() => {
        expect(baseElement.querySelector('.image-zoom-overlay')).toBeInTheDocument();
    });

    return {
        baseElement,
        thumbnail,
        zoomed: () => baseElement.querySelector('.image-zoom-image') as HTMLElement,
        overlay: () => baseElement.querySelector('.image-zoom-overlay'),
    };
}

describe('FieldHelpButton screenshot zoom', () => {
    describe('what it shows', () => {
        it('shows the resolved screenshot with the step alt text', async () => {
            const { zoomed } = await openZoom();

            expect(zoomed()).toHaveAttribute('src', 'vscode-webview://test/media/step1.png');
            expect(zoomed()).toHaveAttribute('alt', 'the shot of step one');
        });

        it('names the step when the step gave no alt text of its own', async () => {
            const { zoomed } = await openZoom(HELP_NO_ALT);

            expect(zoomed()).toHaveAttribute('alt', 'Step 1');
        });
    });

    describe('dismissing it', () => {
        it('closes on Escape', async () => {
            const { zoomed, overlay } = await openZoom();

            fireEvent.keyDown(zoomed(), { key: 'Escape' });

            await waitFor(() => {
                expect(overlay()).not.toBeInTheDocument();
            });
        });

        it('stays open for any other key', async () => {
            const { zoomed, overlay } = await openZoom();

            fireEvent.keyDown(zoomed(), { key: 'a' });

            expect(overlay()).toBeInTheDocument();
        });

        it('closes on a click anywhere', async () => {
            const { zoomed, overlay } = await openZoom();

            fireEvent.click(zoomed());

            await waitFor(() => {
                expect(overlay()).not.toBeInTheDocument();
            });
        });
    });

    /**
     * The dialog underneath must not see any of this. If it does, dismissing the
     * zoom dismisses the help as well and the user loses their place.
     */
    describe('keeping the events away from the dialog underneath', () => {
        it('stops the dismissing Escape before anything else on the page sees it', async () => {
            const { zoomed } = await openZoom();
            const { spy, dispose } = listenAfterTheOverlay('keydown');

            fireEvent.keyDown(zoomed(), { key: 'Escape' });

            expect(spy).not.toHaveBeenCalled();
            dispose();
        });

        it('stops the dismissing click before anything else on the page sees it', async () => {
            const { zoomed } = await openZoom();
            const { spy, dispose } = listenAfterTheOverlay('click');

            fireEvent.click(zoomed());

            expect(spy).not.toHaveBeenCalled();
            dispose();
        });

        it.each(['pointerdown', 'mousedown'])(
            'swallows %s while the zoom is open, so the modal never starts a dismiss',
            async (type) => {
                const { zoomed } = await openZoom();
                const { spy, dispose } = listenAfterTheOverlay(type);

                fireEvent[type === 'pointerdown' ? 'pointerDown' : 'mouseDown'](zoomed());

                expect(spy).not.toHaveBeenCalled();
                dispose();
            },
        );

        /**
         * The listeners come off with the same capture flag they went on with.
         * A mismatched flag leaves them attached for the life of the webview,
         * swallowing every later click on the page.
         */
        it.each(['pointerdown', 'mousedown', 'click', 'keydown'])(
            'lets %s through again once the zoom is closed',
            async (type) => {
                const { zoomed, overlay, thumbnail } = await openZoom();
                fireEvent.keyDown(zoomed(), { key: 'Escape' });
                await waitFor(() => {
                    expect(overlay()).not.toBeInTheDocument();
                });

                const { spy, dispose } = listenAfterTheOverlay(type);
                fireEvent[
                    ({
                        pointerdown: 'pointerDown',
                        mousedown: 'mouseDown',
                        click: 'click',
                        keydown: 'keyDown',
                    } as const)[type as 'pointerdown' | 'mousedown' | 'click' | 'keydown']
                ](thumbnail, { key: 'Escape' });

                expect(spy).toHaveBeenCalled();
                dispose();
            },
        );
    });

    /**
     * The thumbnail is an image acting as a button, so it has to answer the keys
     * a button answers. Without this it is reachable by Tab and does nothing.
     */
    describe('opening it from the keyboard', () => {
        it.each([
            ['Enter', 'Enter'],
            ['Space', ' '],
        ])('opens the zoom on %s', async (_name, key) => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton help={HELP_NO_ALT} fieldLabel="Test Field" baseUri="vscode-webview://test" />,
            );
            await openHelp('the only step');

            fireEvent.keyDown(baseElement.querySelector('img.screenshot-thumbnail') as HTMLElement, {
                key,
            });

            await waitFor(() => {
                expect(baseElement.querySelector('.image-zoom-image')).toHaveAttribute('alt', 'Step 1');
            });
        });

        it('ignores any other key, so typing does not fill the screen', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton help={HELP} fieldLabel="Test Field" baseUri="vscode-webview://test" />,
            );
            await openHelp('the only step');

            fireEvent.keyDown(baseElement.querySelector('img.screenshot-thumbnail') as HTMLElement, {
                key: 'a',
            });

            expect(baseElement.querySelector('.image-zoom-overlay')).not.toBeInTheDocument();
        });
    });
});
