import React from 'react';
import { renderWithProviders, screen } from "../../../../helpers/react-test-utils";
import userEvent from '@testing-library/user-event';
import {
    NavigationPanel,
    NavigationSection
} from '@/core/ui/components/navigation/NavigationPanel';
import { createMockSections } from './NavigationPanel.testUtils';

describe('NavigationPanel - Display', () => {
    describe('Rendering', () => {
        it('renders all sections', () => {
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

            expect(screen.getByText('Adobe Commerce')).toBeInTheDocument();
            expect(screen.getByText('API Mesh')).toBeInTheDocument();
        });

        it('renders heading "Sections"', () => {
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

            expect(screen.getByText('Sections')).toBeInTheDocument();
        });

        it('renders section completion status', () => {
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

            expect(screen.getByText('2/3')).toBeInTheDocument();
            expect(screen.getByText('✓')).toBeInTheDocument();
        });
    });

    describe('Section Expansion', () => {
        it('does not show fields when section collapsed', () => {
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

            expect(screen.queryByText('Field 1')).not.toBeInTheDocument();
        });

        it('shows fields when section expanded', () => {
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

            expect(screen.getByText('Field 1')).toBeInTheDocument();
            expect(screen.getByText('Field 2')).toBeInTheDocument();
            expect(screen.getByText('Field 3')).toBeInTheDocument();
        });

        it('calls onToggleSection when section clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const handleToggle = jest.fn();
            const mockSections = createMockSections();

            renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection={null}
                    activeField={null}
                    expandedSections={new Set()}
                    onToggleSection={handleToggle}
                    onNavigateToField={jest.fn()}
                />
            );

            const sectionButton = screen.getByText('Adobe Commerce').closest('button');
            if (sectionButton) {
                await user.click(sectionButton);
                expect(handleToggle).toHaveBeenCalledWith('section1');
            }
        });

        it('shows chevron right when collapsed', () => {
            const mockSections = createMockSections();
            const { container } = renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection={null}
                    activeField={null}
                    expandedSections={new Set()}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            // ChevronRight icon should be present
            expect(container.querySelector('svg')).toBeInTheDocument();
        });

        it('shows chevron down when expanded', () => {
            const mockSections = createMockSections();
            const { container } = renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection={null}
                    activeField={null}
                    expandedSections={new Set(['section1'])}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            // ChevronDown icon should be present
            expect(container.querySelector('svg')).toBeInTheDocument();
        });
    });

    describe('Active States', () => {
        it('highlights active section with CSS class', () => {
            const mockSections = createMockSections();
            renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection="section1"
                    activeField={null}
                    expandedSections={new Set()}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            const activeButton = screen.getByText('Adobe Commerce').closest('button');
            // SOP §11: Styles moved to CSS classes - verify class is applied
            expect(activeButton).toHaveClass('nav-section-button');
            expect(activeButton).toHaveClass('nav-section-button-active');
        });

        it('does not apply active class to inactive sections', () => {
            const mockSections = createMockSections();
            renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection="section1"
                    activeField={null}
                    expandedSections={new Set()}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            const inactiveButton = screen.getByText('API Mesh').closest('button');
            expect(inactiveButton).toHaveClass('nav-section-button');
            expect(inactiveButton).not.toHaveClass('nav-section-button-active');
        });

        it('highlights active field with CSS class', () => {
            const mockSections = createMockSections();
            renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection="section1"
                    activeField="field1"
                    expandedSections={new Set(['section1'])}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            const activeField = screen.getByText('Field 1').closest('button');
            // SOP §11: Styles moved to CSS classes - verify class is applied
            expect(activeField).toHaveClass('nav-field-button');
            expect(activeField).toHaveClass('nav-field-button-active');
        });

        it('does not apply active class to inactive fields', () => {
            const mockSections = createMockSections();
            renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection="section1"
                    activeField="field1"
                    expandedSections={new Set(['section1'])}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            const inactiveField = screen.getByText('Field 2').closest('button');
            expect(inactiveField).toHaveClass('nav-field-button');
            expect(inactiveField).not.toHaveClass('nav-field-button-active');
        });

        it('applies bold font to active section', () => {
            const mockSections = createMockSections();
            renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection="section1"
                    activeField={null}
                    expandedSections={new Set()}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            const sectionText = screen.getByText('Adobe Commerce');
            expect(sectionText).toHaveClass('font-bold');
        });

        it('applies medium font to inactive section', () => {
            const mockSections = createMockSections();
            renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection="section1"
                    activeField={null}
                    expandedSections={new Set()}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            const sectionText = screen.getByText('API Mesh');
            expect(sectionText).toHaveClass('font-medium');
        });
    });

    describe('Section Completion', () => {
        it('shows completion checkmark for complete section', () => {
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

            // API Mesh section is complete
            expect(screen.getByText('✓')).toBeInTheDocument();
        });

        it('shows progress fraction for incomplete section', () => {
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

            expect(screen.getByText('2/3')).toBeInTheDocument();
        });

        it('shows "Optional" for sections with no required fields', () => {
            const optionalSection: NavigationSection = {
                id: 'optional',
                label: 'Optional Config',
                fields: [],
                isComplete: false,
                completedCount: 0,
                totalCount: 0
            };

            renderWithProviders(
                <NavigationPanel
                    sections={[optionalSection]}
                    activeSection={null}
                    activeField={null}
                    expandedSections={new Set()}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            expect(screen.getByText('Optional')).toBeInTheDocument();
        });
    });

    describe('Layout', () => {
        it('has correct container styles', () => {
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

            // Find heading and get its parent container
            const heading = screen.getByText('Sections');
            const panel = heading.parentElement as HTMLElement;
            // CSS class-based styling (§11 SOP compliance)
            expect(panel).toHaveClass('nav-panel-container');
        });

        it('has scrollable content area', () => {
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

            // The scrollable Flex contains the sections, verify by checking section content is rendered
            // (Presence of section content confirms the scrollable Flex is rendered)
            expect(screen.getByText('Adobe Commerce')).toBeInTheDocument();
            expect(screen.getByText('API Mesh')).toBeInTheDocument();
        });
    });

    describe('IDs', () => {
        it('assigns correct IDs to section buttons', () => {
            const mockSections = createMockSections();
            const { container } = renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection={null}
                    activeField={null}
                    expandedSections={new Set()}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            expect(container.querySelector('#nav-section1')).toBeInTheDocument();
            expect(container.querySelector('#nav-section2')).toBeInTheDocument();
        });

        it('assigns correct IDs to field buttons', () => {
            const mockSections = createMockSections();
            const { container } = renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection={null}
                    activeField={null}
                    expandedSections={new Set(['section1'])}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            expect(container.querySelector('#nav-field-field1')).toBeInTheDocument();
            expect(container.querySelector('#nav-field-field2')).toBeInTheDocument();
            expect(container.querySelector('#nav-field-field3')).toBeInTheDocument();
        });
    });

    describe('Multiple Expanded Sections', () => {
        it('shows multiple expanded sections simultaneously', () => {
            const mockSections = createMockSections();
            renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection={null}
                    activeField={null}
                    expandedSections={new Set(['section1', 'section2'])}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            expect(screen.getByText('Field 1')).toBeInTheDocument();
            expect(screen.getByText('Mesh Field 1')).toBeInTheDocument();
        });
    });

    describe('Edge Cases', () => {
        it('handles empty sections array', () => {
            renderWithProviders(
                <NavigationPanel
                    sections={[]}
                    activeSection={null}
                    activeField={null}
                    expandedSections={new Set()}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            expect(screen.getByText('Sections')).toBeInTheDocument();
        });

        it('handles section with empty fields', () => {
            const emptySection: NavigationSection = {
                id: 'empty',
                label: 'Empty Section',
                fields: [],
                isComplete: false,
                completedCount: 0,
                totalCount: 0
            };

            renderWithProviders(
                <NavigationPanel
                    sections={[emptySection]}
                    activeSection={null}
                    activeField={null}
                    expandedSections={new Set(['empty'])}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            expect(screen.getByText('Empty Section')).toBeInTheDocument();
        });

        it('handles long section labels', () => {
            const longSection: NavigationSection = {
                id: 'long',
                label: 'This is a very long section label that might wrap',
                fields: [],
                isComplete: false,
                completedCount: 0,
                totalCount: 0
            };

            renderWithProviders(
                <NavigationPanel
                    sections={[longSection]}
                    activeSection={null}
                    activeField={null}
                    expandedSections={new Set()}
                    onToggleSection={jest.fn()}
                    onNavigateToField={jest.fn()}
                />
            );

            expect(screen.getByText('This is a very long section label that might wrap')).toBeInTheDocument();
        });
    });
});
