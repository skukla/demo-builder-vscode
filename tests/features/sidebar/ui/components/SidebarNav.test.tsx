/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarNav } from '@/features/sidebar/ui/components/SidebarNav';
import { createProjectsNavItems, createProjectDetailNavItems } from '../../testUtils';

// Wrap component with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => render(ui); // Simplified - no Provider needed

describe('SidebarNav', () => {
    describe('rendering', () => {
        it('should render navigation items', () => {
            const items = createProjectsNavItems();
            renderWithProvider(
                <SidebarNav items={items} onNavigate={jest.fn()} />
            );

            expect(screen.getByText('Projects')).toBeInTheDocument();
        });

        it('should highlight active item', () => {
            const items = createProjectDetailNavItems('overview');
            renderWithProvider(
                <SidebarNav items={items} onNavigate={jest.fn()} />
            );

            const overviewItem = screen.getByText('Overview');
            expect(overviewItem.closest('[data-active="true"]')).toBeInTheDocument();
        });

        it('should render multiple items', () => {
            const items = createProjectDetailNavItems();
            renderWithProvider(
                <SidebarNav items={items} onNavigate={jest.fn()} />
            );

            expect(screen.getByText('Overview')).toBeInTheDocument();
            expect(screen.getByText('Configure')).toBeInTheDocument();
            expect(screen.getByText('Updates')).toBeInTheDocument();
        });
    });

    describe('interactions', () => {
        it('should call onNavigate when item is clicked', () => {
            const items = createProjectDetailNavItems();
            const onNavigate = jest.fn();
            renderWithProvider(
                <SidebarNav items={items} onNavigate={onNavigate} />
            );

            fireEvent.click(screen.getByText('Configure'));

            expect(onNavigate).toHaveBeenCalledWith('configure');
        });

        it('should call onNavigate with correct id', () => {
            const items = createProjectDetailNavItems();
            const onNavigate = jest.fn();
            renderWithProvider(
                <SidebarNav items={items} onNavigate={onNavigate} />
            );

            fireEvent.click(screen.getByText('Updates'));

            expect(onNavigate).toHaveBeenCalledWith('updates');
        });
    });

    describe('accessibility', () => {
        it('should be keyboard navigable', () => {
            const items = createProjectDetailNavItems();
            renderWithProvider(
                <SidebarNav items={items} onNavigate={jest.fn()} />
            );

            const navItems = screen.getAllByRole('button');
            navItems.forEach((item) => {
                expect(item).toHaveAttribute('tabIndex');
            });
        });
    });
});
