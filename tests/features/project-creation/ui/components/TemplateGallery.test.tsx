/**
 * TemplateGallery Component Tests
 *
 * Tests for the main template gallery with search and view modes.
 * Uses SearchHeader component for search and view toggle.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplateGallery } from '@/features/project-creation/ui/components/TemplateGallery';
import { DemoTemplate } from '@/types/templates';

// Mock templates
const mockTemplates: DemoTemplate[] = [
    {
        id: 'template-1',
        name: 'Commerce Template',
        description: 'Full commerce solution with headless frontend',
        defaults: { frontend: 'nextjs' },
    },
    {
        id: 'template-2',
        name: 'Storefront Basic',
        description: 'Basic storefront with minimal setup',
        defaults: { frontend: 'react' },
    },
    {
        id: 'template-3',
        name: 'AI Personalization',
        description: 'Template with AI-powered personalization',
        defaults: { frontend: 'nextjs' },
    },
];

describe('TemplateGallery', () => {
    const mockOnSelect = jest.fn();

    beforeEach(() => {
        mockOnSelect.mockClear();
    });

    describe('basic rendering', () => {
        it('should render all templates', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            expect(screen.getByText('Commerce Template')).toBeInTheDocument();
            expect(screen.getByText('Storefront Basic')).toBeInTheDocument();
            expect(screen.getByText('AI Personalization')).toBeInTheDocument();
        });

        it('should show empty state when no templates provided', () => {
            render(
                <TemplateGallery
                    templates={[]}
                    onSelect={mockOnSelect}
                />
            );

            expect(screen.getByText('No templates available')).toBeInTheDocument();
        });

        it('should show template count', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            // SearchHeader shows count like "3 templates"
            expect(screen.getByText(/3 templates/)).toBeInTheDocument();
        });
    });

    describe('search functionality', () => {
        it('should filter templates by name', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            const searchInput = screen.getByPlaceholderText('Filter templates...');
            fireEvent.change(searchInput, { target: { value: 'Commerce' } });

            expect(screen.getByText('Commerce Template')).toBeInTheDocument();
            expect(screen.queryByText('Storefront Basic')).not.toBeInTheDocument();
            expect(screen.queryByText('AI Personalization')).not.toBeInTheDocument();
        });

        it('should filter templates by description', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            const searchInput = screen.getByPlaceholderText('Filter templates...');
            fireEvent.change(searchInput, { target: { value: 'headless' } });

            expect(screen.getByText('Commerce Template')).toBeInTheDocument();
            expect(screen.queryByText('Storefront Basic')).not.toBeInTheDocument();
        });

        it('should show all templates when search is empty', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            const searchInput = screen.getByPlaceholderText('Filter templates...');

            // First filter
            fireEvent.change(searchInput, { target: { value: 'Commerce' } });
            expect(screen.queryByText('Storefront Basic')).not.toBeInTheDocument();

            // Clear filter
            fireEvent.change(searchInput, { target: { value: '' } });
            expect(screen.getByText('Commerce Template')).toBeInTheDocument();
            expect(screen.getByText('Storefront Basic')).toBeInTheDocument();
            expect(screen.getByText('AI Personalization')).toBeInTheDocument();
        });

        it('should show "no results" message when no matches', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            const searchInput = screen.getByPlaceholderText('Filter templates...');
            fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

            expect(screen.getByText(/No templates match/)).toBeInTheDocument();
        });

        it('should be case insensitive', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            const searchInput = screen.getByPlaceholderText('Filter templates...');
            fireEvent.change(searchInput, { target: { value: 'COMMERCE' } });

            expect(screen.getByText('Commerce Template')).toBeInTheDocument();
        });

        it('should update filtered count when searching', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            const searchInput = screen.getByPlaceholderText('Filter templates...');
            fireEvent.change(searchInput, { target: { value: 'Commerce' } });

            // Should show filtered count
            expect(screen.getByText(/1 of 3/)).toBeInTheDocument();
        });
    });

    describe('view mode', () => {
        it('should render cards view by default', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            // Should have cards grid container
            const grid = document.querySelector('.projects-grid');
            expect(grid).toBeInTheDocument();
        });

        it('should switch to rows view when toggle clicked', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            // Click list view button
            fireEvent.click(screen.getByLabelText('List view'));

            // Should have rows container
            const rowList = document.querySelector('.projects-row-list');
            expect(rowList).toBeInTheDocument();
        });

        it('should switch back to cards view', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            // Switch to rows then back to cards
            fireEvent.click(screen.getByLabelText('List view'));
            fireEvent.click(screen.getByLabelText('Card view'));

            const grid = document.querySelector('.projects-grid');
            expect(grid).toBeInTheDocument();
        });
    });

    describe('selection', () => {
        it('should highlight selected template', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    selectedTemplateId="template-1"
                    onSelect={mockOnSelect}
                />
            );

            // Find the selected card
            const selectedCard = screen.getByLabelText('Commerce Template: Full commerce solution with headless frontend');
            expect(selectedCard).toHaveAttribute('data-selected', 'true');
        });

        it('should call onSelect when template is clicked', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            // Click on a template
            fireEvent.click(screen.getByText('Storefront Basic'));

            expect(mockOnSelect).toHaveBeenCalledWith('template-2');
        });

        it('should work in both card and row views', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            // Click in card view
            fireEvent.click(screen.getByText('Commerce Template'));
            expect(mockOnSelect).toHaveBeenCalledWith('template-1');

            mockOnSelect.mockClear();

            // Switch to row view and click
            fireEvent.click(screen.getByLabelText('List view'));
            fireEvent.click(screen.getByText('Storefront Basic'));
            expect(mockOnSelect).toHaveBeenCalledWith('template-2');
        });
    });
});
