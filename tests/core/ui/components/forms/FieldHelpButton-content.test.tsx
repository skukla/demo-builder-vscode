/**
 * What FieldHelpButton puts on screen, for each shape of help it can be given.
 *
 * The sibling suites cover step NAVIGATION and the zoom OVERLAY. This one is
 * about the decisions taken before anything is clicked: whether there is
 * anything worth showing at all, which variant renders, where a screenshot
 * resolves to, and whether a step gets a number.
 */
import React from 'react';
import { renderWithProviders, screen } from '../../../../helpers/react-test-utils';
import { FieldHelpButton } from '@/core/ui/components/forms/FieldHelpButton';
import { openHelp } from './FieldHelpButton.testUtils';


describe('FieldHelpButton content', () => {
    afterEach(() => {
        delete window.__WEBVIEW_BASE_URI__;
    });

    /**
     * An icon with nothing behind it is worse than no icon: it invites a click
     * that opens an empty dialog. A field with no help renders no button.
     */
    describe('nothing to say', () => {
        it('renders no button at all when there is neither text nor steps', () => {
            const { container } = renderWithProviders(
                <FieldHelpButton help={{}} fieldLabel="Test Field" />,
            );

            expect(container.querySelector('[data-testid="spectrum-provider"]')).toBeEmptyDOMElement();
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        });

        it('renders no button for an EMPTY steps array, which is not content', () => {
            const { container } = renderWithProviders(
                <FieldHelpButton help={{ steps: [] }} fieldLabel="Test Field" />,
            );

            expect(container.querySelector('[data-testid="spectrum-provider"]')).toBeEmptyDOMElement();
        });
    });

    /**
     * The popover is the short-hint variant: no heading, no footer, no step
     * navigation. Every step is laid out at once instead.
     */
    describe('popover variant', () => {
        it('lays every step out at once, with no dialog chrome', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton
                    help={{ text: 'the short hint', steps: [{ text: 'first' }, { text: 'second' }] }}
                    variant="popover"
                    fieldLabel="Test Field"
                />,
            );

            await openHelp('the short hint');

            expect(screen.getByText('first')).toBeInTheDocument();
            expect(screen.getByText('second')).toBeInTheDocument();
            // Numbered, because there is more than one of them.
            expect(
                Array.from(baseElement.querySelectorAll('.number-badge'), (n) => n.textContent),
            ).toEqual([
                '1',
                '2',
            ]);
            // No footer: the popover is dismissed by clicking away, not by a button.
            expect(screen.queryByRole('button', { name: /Got it/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Next/i })).not.toBeInTheDocument();
        });

        it('shows text alone when the help carries no steps', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton
                    help={{ text: 'the short hint' }}
                    variant="popover"
                    fieldLabel="Test Field"
                />,
            );

            await openHelp('the short hint');

            expect(baseElement.querySelector('.instruction-card')).not.toBeInTheDocument();
        });

        // A bare string would inherit the surrounding layout's typography; the
        // Spectrum Text element is what makes it read as body copy.
        it('renders the text through a Spectrum Text element, not as a bare string', async () => {
            renderWithProviders(
                <FieldHelpButton
                    help={{ text: 'the short hint' }}
                    variant="popover"
                    fieldLabel="Test Field"
                />,
            );

            await openHelp('the short hint');

            expect(screen.getByText('the short hint').tagName).toBe('SPAN');
        });
    });

    describe('modal variant', () => {
        it('renders the text through a Spectrum Text element, not as a bare string', async () => {
            renderWithProviders(
                <FieldHelpButton help={{ text: 'the explanation' }} fieldLabel="Test Field" />,
            );

            await openHelp('the explanation');

            expect(screen.getByText('the explanation').tagName).toBe('SPAN');
        });

        it('shows the text and no step card when the steps array is empty', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton
                    help={{ text: 'the explanation', steps: [] }}
                    fieldLabel="Test Field"
                />,
            );

            await openHelp('the explanation');

            expect(baseElement.querySelector('.instruction-card')).not.toBeInTheDocument();
        });

        it('falls back to the field label when the help has no title of its own', async () => {
            renderWithProviders(
                <FieldHelpButton help={{ text: 'the explanation' }} fieldLabel="Test Field" />,
            );

            await openHelp('the explanation');

            expect(screen.getByText('Help: Test Field')).toBeInTheDocument();
        });
    });

    /**
     * A screenshot is stored as a bare file name. It only loads once it is
     * resolved against the webview's base URI, which the extension host injects
     * — so getting this wrong is a dialog full of broken images.
     */
    describe('screenshot paths', () => {
        const oneShot = { steps: [{ text: 'do this', screenshot: 'step1.png' }] };

        it('resolves against the baseUri prop when one is given', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton help={oneShot} fieldLabel="Test Field" baseUri="vscode-webview://prop" />,
            );

            await openHelp('do this');

            expect(baseElement.querySelector('img.screenshot-thumbnail')).toHaveAttribute(
                'src',
                'vscode-webview://prop/media/step1.png',
            );
        });

        it('falls back to the base URI the webview was given when there is no prop', async () => {
            window.__WEBVIEW_BASE_URI__ = 'vscode-webview://injected';

            const { baseElement } = renderWithProviders(
                <FieldHelpButton help={oneShot} fieldLabel="Test Field" />,
            );

            await openHelp('do this');

            expect(baseElement.querySelector('img.screenshot-thumbnail')).toHaveAttribute(
                'src',
                'vscode-webview://injected/media/step1.png',
            );
        });

        it('leaves the name alone when there is no base URI anywhere', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton help={oneShot} fieldLabel="Test Field" />,
            );

            await openHelp('do this');

            expect(baseElement.querySelector('img.screenshot-thumbnail')).toHaveAttribute(
                'src',
                'step1.png',
            );
        });

        it('renders no image for a step that has no screenshot', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton
                    help={{ steps: [{ text: 'do this' }] }}
                    fieldLabel="Test Field"
                    baseUri="vscode-webview://prop"
                />,
            );

            await openHelp('do this');

            expect(baseElement.querySelector('img.screenshot-thumbnail')).not.toBeInTheDocument();
        });

        it('names the step in the alt text when the step gave none', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton help={oneShot} fieldLabel="Test Field" baseUri="vscode-webview://prop" />,
            );

            await openHelp('do this');

            expect(baseElement.querySelector('img.screenshot-thumbnail')).toHaveAttribute(
                'alt',
                'Step 1',
            );
        });
    });

    /**
     * The badge numbers a step within a sequence. One step is not a sequence,
     * so a lone "1" would be noise.
     */
    describe('step numbering', () => {
        it('numbers the step when there is more than one', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton
                    help={{ steps: [{ text: 'first' }, { text: 'second' }] }}
                    fieldLabel="Test Field"
                />,
            );

            await openHelp('first');

            expect(baseElement.querySelector('.number-badge')).toHaveTextContent('1');
        });

        it('shows no badge for a single step', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton help={{ steps: [{ text: 'the only step' }] }} fieldLabel="Test Field" />,
            );

            await openHelp('the only step');

            expect(baseElement.querySelector('.number-badge')).not.toBeInTheDocument();
        });
    });
});
