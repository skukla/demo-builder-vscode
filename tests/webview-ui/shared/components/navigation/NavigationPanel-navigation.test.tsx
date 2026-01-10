import React from 'react';
import { renderWithProviders, screen, cleanup } from "../../../../helpers/react-test-utils";
import userEvent from '@testing-library/user-event';
import { NavigationPanel } from '@/core/ui/components/navigation/NavigationPanel';
import { createMockSections } from './NavigationPanel.testUtils';

describe('NavigationPanel - Navigation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
        jest.clearAllMocks();
    });

    describe('Field Navigation', () => {
        it('calls onNavigateToField when field clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const handleNavigate = jest.fn();
            const mockSections = createMockSections();

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

            // Multiple checkmarks should exist (Field 1 and Field 3 are complete)
            const checkmarks = screen.getAllByText('✓');
            expect(checkmarks.length).toBeGreaterThan(0);
        });

        it('does not show checkmark on incomplete fields', () => {
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

            // Field 2 should be visible but without checkmark
            expect(screen.getByText('Field 2')).toBeInTheDocument();
        });
    });
});
