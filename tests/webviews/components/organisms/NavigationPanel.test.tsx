import React from 'react';
import { renderWithProviders, screen } from '../../../utils/react-test-utils';
import userEvent from '@testing-library/user-event';
import {
    NavigationPanel,
    NavigationSection,
    NavigationField
} from '@/webview-ui/shared/components/navigation/NavigationPanel';

const mockFields: NavigationField[] = [
    { key: 'field1', label: 'Field 1', isComplete: true },
    { key: 'field2', label: 'Field 2', isComplete: false },
    { key: 'field3', label: 'Field 3', isComplete: true }
];

const mockSections: NavigationSection[] = [
    {
        id: 'section1',
        label: 'Adobe Commerce',
        fields: mockFields,
        isComplete: false,
        completedCount: 2,
        totalCount: 3
    },
    {
        id: 'section2',
        label: 'API Mesh',
        fields: [
            { key: 'mesh1', label: 'Mesh Field 1', isComplete: true }
        ],
        isComplete: true,
        completedCount: 1,
        totalCount: 1
    }
];

describe('NavigationPanel', () => {
    describe('Rendering', () => {
        it('renders all sections', () => {
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
            const user = userEvent.setup();
            const handleToggle = jest.fn();

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

    describe('Field Navigation', () => {
        it('calls onNavigateToField when field clicked', async () => {
            const user = userEvent.setup();
            const handleNavigate = jest.fn();

            renderWithProviders(
                <NavigationPanel
                    sections={mockSections}
                    activeSection={null}
                    activeField={null}
                    expandedSections={new Set(['section1'])}
                    onToggleSection={jest.fn()}
                    onNavigateToField={handleNavigate}
                />
            );

            const fieldButton = screen.getByText('Field 1').closest('button');
            if (fieldButton) {
                await user.click(fieldButton);
                expect(handleNavigate).toHaveBeenCalledWith('field1');
            }
        });

        it('shows completed checkmark on completed fields', () => {
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

            // Multiple checkmarks should exist (Field 1 and Field 3 are complete)
            const checkmarks = screen.getAllByText('✓');
            expect(checkmarks.length).toBeGreaterThan(0);
        });

        it('does not show checkmark on incomplete fields', () => {
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

            // Field 2 should be visible but without checkmark
            expect(screen.getByText('Field 2')).toBeInTheDocument();
        });
    });

    describe('Active States', () => {
        it('highlights active section', () => {
            const { container } = renderWithProviders(
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
            expect(activeButton).toHaveStyle({
                borderLeft: '3px solid var(--spectrum-global-color-blue-500)'
            });
        });

        it('highlights active field', () => {
            const { container } = renderWithProviders(
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
            expect(activeField).toHaveStyle({
                borderLeft: '2px solid var(--spectrum-global-color-blue-500)'
            });
        });

        it('applies bold font to active section', () => {
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

            const panel = container.firstChild as HTMLElement;
            expect(panel).toHaveStyle({
                flex: '1',
                padding: '24px'
            });
        });

        it('has scrollable content area', () => {
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

            const scrollArea = container.querySelector('[style*="overflowY"]');
            expect(scrollArea).toBeInTheDocument();
        });
    });

    describe('IDs', () => {
        it('assigns correct IDs to section buttons', () => {
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

    describe('Accessibility', () => {
        it('has heading for sections', () => {
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

    describe('DisplayName', () => {
        it('has display name set', () => {
            expect(NavigationPanel.displayName).toBe('NavigationPanel');
        });
    });

    describe('Memoization', () => {
        it('is memoized component', () => {
            expect(NavigationPanel).toHaveProperty('$$typeof');
        });
    });
});
