/**
 * TemplateGallery Component Tests
 *
 * Tests for the main template gallery with search, tag filtering, and view modes.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplateGallery } from '@/features/project-creation/ui/components/TemplateGallery';
import { DemoTemplate } from '@/types/templates';

// Mock templates with various tags
const mockTemplates: DemoTemplate[] = [
    {
        id: 'template-1',
        name: 'Commerce Template',
        description: 'Full commerce solution with headless frontend',
        defaults: { frontend: 'nextjs' },
        tags: ['commerce', 'headless', 'nextjs'],
        featured: true,
    },
    {
        id: 'template-2',
        name: 'Storefront Basic',
        description: 'Basic storefront with minimal setup',
        defaults: { frontend: 'react' },
        tags: ['storefront', 'react'],
    },
    {
        id: 'template-3',
        name: 'AI Personalization',
        description: 'Template with AI-powered personalization',
        defaults: { frontend: 'nextjs' },
        tags: ['ai', 'personalization', 'nextjs'],
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
    });

    describe('search functionality', () => {
        it('should filter templates by name', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            const searchInput = screen.getByPlaceholderText('Search templates...');
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

            const searchInput = screen.getByPlaceholderText('Search templates...');
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

            const searchInput = screen.getByPlaceholderText('Search templates...');

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

            const searchInput = screen.getByPlaceholderText('Search templates...');
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

            const searchInput = screen.getByPlaceholderText('Search templates...');
            fireEvent.change(searchInput, { target: { value: 'COMMERCE' } });

            expect(screen.getByText('Commerce Template')).toBeInTheDocument();
        });
    });

    describe('tag filtering', () => {
        // Helper to get tag filter button (they have class template-tag-filter)
        const getTagFilterButton = (name: string) => {
            const buttons = screen.getAllByRole('button');
            return buttons.find(btn =>
                btn.classList.contains('template-tag-filter') &&
                btn.textContent?.toLowerCase() === name.toLowerCase()
            );
        };

        it('should show tag filter chips from all template tags', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            // Should show unique tags from all templates (as filter chips)
            expect(getTagFilterButton('commerce')).toBeInTheDocument();
            expect(getTagFilterButton('headless')).toBeInTheDocument();
            expect(getTagFilterButton('nextjs')).toBeInTheDocument();
            expect(getTagFilterButton('storefront')).toBeInTheDocument();
            expect(getTagFilterButton('ai')).toBeInTheDocument();
        });

        it('should filter templates when tag is selected', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            // Click on 'commerce' tag filter
            const commerceTag = getTagFilterButton('commerce');
            fireEvent.click(commerceTag!);

            // Only Commerce Template has 'commerce' tag
            expect(screen.getByText('Commerce Template')).toBeInTheDocument();
            expect(screen.queryByText('Storefront Basic')).not.toBeInTheDocument();
            expect(screen.queryByText('AI Personalization')).not.toBeInTheDocument();
        });

        it('should support multiple tag selection (OR logic)', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            // Select 'commerce' tag
            fireEvent.click(getTagFilterButton('commerce')!);
            // Also select 'ai' tag
            fireEvent.click(getTagFilterButton('ai')!);

            // Should show templates with either tag
            expect(screen.getByText('Commerce Template')).toBeInTheDocument();
            expect(screen.getByText('AI Personalization')).toBeInTheDocument();
            expect(screen.queryByText('Storefront Basic')).not.toBeInTheDocument();
        });

        it('should clear tag filter when chip is deselected', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            // Select tag
            fireEvent.click(getTagFilterButton('commerce')!);
            expect(screen.queryByText('Storefront Basic')).not.toBeInTheDocument();

            // Deselect tag
            fireEvent.click(getTagFilterButton('commerce')!);

            // All templates should be visible again
            expect(screen.getByText('Commerce Template')).toBeInTheDocument();
            expect(screen.getByText('Storefront Basic')).toBeInTheDocument();
            expect(screen.getByText('AI Personalization')).toBeInTheDocument();
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

            // Should have card grid container
            expect(screen.getByTestId('template-grid')).toHaveAttribute('data-view-mode', 'cards');
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

            expect(screen.getByTestId('template-grid')).toHaveAttribute('data-view-mode', 'rows');
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

            expect(screen.getByTestId('template-grid')).toHaveAttribute('data-view-mode', 'cards');
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

    describe('combined filtering', () => {
        // Helper to get tag filter button (they have class template-tag-filter)
        const getTagFilterButton = (name: string) => {
            const buttons = screen.getAllByRole('button');
            return buttons.find(btn =>
                btn.classList.contains('template-tag-filter') &&
                btn.textContent?.toLowerCase() === name.toLowerCase()
            );
        };

        it('should combine search and tag filters', () => {
            render(
                <TemplateGallery
                    templates={mockTemplates}
                    onSelect={mockOnSelect}
                />
            );

            // Select 'nextjs' tag (matches template-1 and template-3)
            fireEvent.click(getTagFilterButton('nextjs')!);

            // Then search for 'Commerce'
            const searchInput = screen.getByPlaceholderText('Search templates...');
            fireEvent.change(searchInput, { target: { value: 'Commerce' } });

            // Only Commerce Template matches both
            expect(screen.getByText('Commerce Template')).toBeInTheDocument();
            expect(screen.queryByText('AI Personalization')).not.toBeInTheDocument();
        });
    });
});
