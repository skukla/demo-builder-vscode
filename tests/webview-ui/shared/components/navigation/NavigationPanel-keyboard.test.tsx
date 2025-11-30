import React from 'react';
import { renderWithProviders, screen } from "../../../../helpers/react-test-utils";
import { NavigationPanel } from '@/core/ui/components/navigation/NavigationPanel';
import { createMockSections } from './NavigationPanel.testUtils';

describe('NavigationPanel - Keyboard & Accessibility', () => {
    describe('Accessibility', () => {
        it('has heading for sections', () => {
            const mockSections = createMockSections();
            renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection={null}
                    activeField={null}
                    expandedSections={new Set()}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            const heading = screen.getByText('Sections');
            expect(heading.tagName).toBe('H3');
        });

        it('sections have tabIndex -1', () => {
            const mockSections = createMockSections();
            renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection={null}
                    activeField={null}
                    expandedSections={new Set()}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            const sectionButton = screen.getByText('Adobe Commerce').closest('button');
            expect(sectionButton).toHaveAttribute('tabIndex', '-1');
        });

        it('fields have tabIndex -1', () => {
            const mockSections = createMockSections();
            renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection={null}
                    activeField={null}
                    expandedSections={new Set(['section1'])}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            const fieldButton = screen.getByText('Field 1').closest('button');
            expect(fieldButton).toHaveAttribute('tabIndex', '-1');
        });
    });
});
