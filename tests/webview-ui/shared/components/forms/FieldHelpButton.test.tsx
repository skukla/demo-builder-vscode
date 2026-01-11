/**
 * FieldHelpButton CSS Class Tests
 *
 * Tests that verify CSS classes are applied correctly for image zoom and
 * screenshot functionality. Part of inline styles → CSS classes refactoring.
 */
import React from 'react';
import { renderWithProviders, screen, fireEvent, waitFor } from '../../../../helpers/react-test-utils';
import { FieldHelpButton } from '@/core/ui/components/forms/FieldHelpButton';

describe('FieldHelpButton', () => {
    // Simple text-only help content
    const simpleHelp = {
        title: 'Test Help',
        text: 'This is some help text for testing.',
    };

    // Help with screenshot (no steps)
    const helpWithScreenshot = {
        title: 'Screenshot Help',
        text: 'Help text with a screenshot.',
    };

    // Help with steps and screenshots
    const helpWithSteps = {
        title: 'Step-by-Step Help',
        steps: [
            {
                text: 'Step 1: Do this first',
                screenshot: 'step1.png',
                screenshotAlt: 'Screenshot of step 1',
            },
            {
                text: 'Step 2: Then do this',
                screenshot: 'step2.png',
                screenshotAlt: 'Screenshot of step 2',
            },
            {
                text: 'Step 3: Finally do this',
            },
        ],
    };

    describe('Screenshot Thumbnail CSS Classes', () => {
        it('applies screenshot-thumbnail class to step screenshot image', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton
                    help={helpWithSteps}
                    fieldLabel="Test Field"
                    baseUri="vscode-webview://test"
                />
            );

            // Open the modal by clicking the help button
            const helpButton = screen.getByRole('button', { name: /Help for Test Field/i });
            fireEvent.click(helpButton);

            // Wait for modal content to render
            await waitFor(() => {
                expect(screen.getByText('Step-by-Step Help')).toBeInTheDocument();
            });

            // Find the screenshot image - modal content is portaled to body
            const screenshotImg = baseElement.querySelector('img[alt="Screenshot of step 1"]');
            expect(screenshotImg).toBeInTheDocument();
            expect(screenshotImg).toHaveClass('screenshot-thumbnail');
        });
    });

    describe('Image Zoom Overlay CSS Classes', () => {
        it('applies image-zoom-overlay class when image is zoomed', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton
                    help={helpWithSteps}
                    fieldLabel="Test Field"
                    baseUri="vscode-webview://test"
                />
            );

            // Open the modal
            const helpButton = screen.getByRole('button', { name: /Help for Test Field/i });
            fireEvent.click(helpButton);

            await waitFor(() => {
                expect(screen.getByText('Step-by-Step Help')).toBeInTheDocument();
            });

            // Click the screenshot to zoom - modal content is portaled to body
            const screenshotImg = baseElement.querySelector('img[alt="Screenshot of step 1"]');
            expect(screenshotImg).toBeInTheDocument();
            if (screenshotImg) {
                fireEvent.click(screenshotImg);
            }

            // ImageZoom uses createPortal to body - check baseElement (document.body)
            await waitFor(() => {
                const overlay = baseElement.querySelector('.image-zoom-overlay');
                expect(overlay).toBeInTheDocument();
            });
        });

        it('applies image-zoom-image class to zoomed image', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton
                    help={helpWithSteps}
                    fieldLabel="Test Field"
                    baseUri="vscode-webview://test"
                />
            );

            // Open the modal
            const helpButton = screen.getByRole('button', { name: /Help for Test Field/i });
            fireEvent.click(helpButton);

            await waitFor(() => {
                expect(screen.getByText('Step-by-Step Help')).toBeInTheDocument();
            });

            // Click the screenshot to zoom - modal content is portaled to body
            const screenshotImg = baseElement.querySelector('img[alt="Screenshot of step 1"]');
            if (screenshotImg) {
                fireEvent.click(screenshotImg);
            }

            // Check for zoomed image class in portal
            await waitFor(() => {
                const zoomedImg = baseElement.querySelector('.image-zoom-image');
                expect(zoomedImg).toBeInTheDocument();
            });
        });

        it('applies image-zoom-hint class to close hint text', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton
                    help={helpWithSteps}
                    fieldLabel="Test Field"
                    baseUri="vscode-webview://test"
                />
            );

            // Open the modal
            const helpButton = screen.getByRole('button', { name: /Help for Test Field/i });
            fireEvent.click(helpButton);

            await waitFor(() => {
                expect(screen.getByText('Step-by-Step Help')).toBeInTheDocument();
            });

            // Click the screenshot to zoom - modal content is portaled to body
            const screenshotImg = baseElement.querySelector('img[alt="Screenshot of step 1"]');
            if (screenshotImg) {
                fireEvent.click(screenshotImg);
            }

            // Check for hint class in portal
            await waitFor(() => {
                const hint = baseElement.querySelector('.image-zoom-hint');
                expect(hint).toBeInTheDocument();
            });
        });
    });

    describe('Layout CSS Classes', () => {
        it('applies min-h-48 class to wrapper for consistent height', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton
                    help={helpWithSteps}
                    fieldLabel="Test Field"
                    baseUri="vscode-webview://test"
                />
            );

            // Open the modal
            const helpButton = screen.getByRole('button', { name: /Help for Test Field/i });
            fireEvent.click(helpButton);

            await waitFor(() => {
                expect(screen.getByText('Step-by-Step Help')).toBeInTheDocument();
            });

            // Look for min-height wrapper - modal content is portaled to body
            const wrapper = baseElement.querySelector('.min-h-48');
            expect(wrapper).toBeInTheDocument();
        });

        it('applies flex-1 class for flex spacer', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton
                    help={helpWithSteps}
                    fieldLabel="Test Field"
                    baseUri="vscode-webview://test"
                />
            );

            // Open the modal
            const helpButton = screen.getByRole('button', { name: /Help for Test Field/i });
            fireEvent.click(helpButton);

            await waitFor(() => {
                expect(screen.getByText('Step-by-Step Help')).toBeInTheDocument();
            });

            // Look for flex spacer in footer - modal content is portaled to body
            const flexSpacer = baseElement.querySelector('.flex-1');
            expect(flexSpacer).toBeInTheDocument();
        });

        it('applies flex-end-container class for right-aligned content', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton
                    help={helpWithSteps}
                    fieldLabel="Test Field"
                    baseUri="vscode-webview://test"
                />
            );

            // Open the modal
            const helpButton = screen.getByRole('button', { name: /Help for Test Field/i });
            fireEvent.click(helpButton);

            await waitFor(() => {
                expect(screen.getByText('Step-by-Step Help')).toBeInTheDocument();
            });

            // Look for right-aligned container in footer - modal content is portaled to body
            const flexEndContainer = baseElement.querySelector('.flex-end-container');
            expect(flexEndContainer).toBeInTheDocument();
        });
    });

    describe('Step Counter CSS Classes', () => {
        it('applies step-counter class to step navigation text', async () => {
            const { baseElement } = renderWithProviders(
                <FieldHelpButton
                    help={helpWithSteps}
                    fieldLabel="Test Field"
                    baseUri="vscode-webview://test"
                />
            );

            // Open the modal
            const helpButton = screen.getByRole('button', { name: /Help for Test Field/i });
            fireEvent.click(helpButton);

            await waitFor(() => {
                expect(screen.getByText('Step-by-Step Help')).toBeInTheDocument();
            });

            // Look for step counter with proper class - modal content is portaled to body
            const stepCounter = baseElement.querySelector('.step-counter');
            expect(stepCounter).toBeInTheDocument();
        });
    });

    describe('Basic Functionality', () => {
        it('renders help button', () => {
            renderWithProviders(
                <FieldHelpButton
                    help={simpleHelp}
                    fieldLabel="Test Field"
                />
            );

            expect(screen.getByRole('button', { name: /Help for Test Field/i })).toBeInTheDocument();
        });

        it('opens modal on click and shows help text', async () => {
            renderWithProviders(
                <FieldHelpButton
                    help={simpleHelp}
                    fieldLabel="Test Field"
                />
            );

            const helpButton = screen.getByRole('button', { name: /Help for Test Field/i });
            fireEvent.click(helpButton);

            await waitFor(() => {
                expect(screen.getByText('Test Help')).toBeInTheDocument();
                expect(screen.getByText('This is some help text for testing.')).toBeInTheDocument();
            });
        });

        it('shows step-by-step navigation for multi-step help', async () => {
            renderWithProviders(
                <FieldHelpButton
                    help={helpWithSteps}
                    fieldLabel="Test Field"
                    baseUri="vscode-webview://test"
                />
            );

            const helpButton = screen.getByRole('button', { name: /Help for Test Field/i });
            fireEvent.click(helpButton);

            await waitFor(() => {
                expect(screen.getByText('Step 1: Do this first')).toBeInTheDocument();
            });
        });
    });
});
