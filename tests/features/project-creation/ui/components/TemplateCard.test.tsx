/**
 * TemplateCard Component Tests
 *
 * Tests for the enhanced template card component used in grid view.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplateCard } from '@/features/project-creation/ui/components/TemplateCard';
import { DemoTemplate } from '@/types/templates';

// Mock template data
const mockTemplate: DemoTemplate = {
    id: 'test-template',
    name: 'Test Template',
    description: 'A test template for unit testing',
    defaults: {
        frontend: 'test-frontend',
        backend: 'test-backend',
    },
};

const mockTemplateWithExtras: DemoTemplate = {
    id: 'featured-template',
    name: 'Featured Template',
    description: 'A featured template with all options',
    defaults: {
        frontend: 'test-frontend',
    },
    icon: 'Star',
    tags: ['commerce', 'ai', 'personalization'],
    featured: true,
};

describe('TemplateCard', () => {
    const mockOnSelect = jest.fn();

    beforeEach(() => {
        mockOnSelect.mockClear();
    });

    it('should render template name and description', () => {
        render(
            <TemplateCard
                template={mockTemplate}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        expect(screen.getByText('Test Template')).toBeInTheDocument();
        expect(screen.getByText('A test template for unit testing')).toBeInTheDocument();
    });

    it('should display icon when provided', () => {
        render(
            <TemplateCard
                template={mockTemplateWithExtras}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        // Icon should be rendered (we'll check for the icon container)
        const card = screen.getByRole('button');
        expect(card).toHaveAttribute('data-has-icon', 'true');
    });

    it('should show featured badge when template.featured is true', () => {
        render(
            <TemplateCard
                template={mockTemplateWithExtras}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        expect(screen.getByText('Featured')).toBeInTheDocument();
    });

    it('should not show featured badge when template.featured is false', () => {
        render(
            <TemplateCard
                template={mockTemplate}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        expect(screen.queryByText('Featured')).not.toBeInTheDocument();
    });

    it('should render tags as chips', () => {
        render(
            <TemplateCard
                template={mockTemplateWithExtras}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        expect(screen.getByText('commerce')).toBeInTheDocument();
        expect(screen.getByText('ai')).toBeInTheDocument();
        expect(screen.getByText('personalization')).toBeInTheDocument();
    });

    it('should apply selected styling when isSelected is true', () => {
        render(
            <TemplateCard
                template={mockTemplate}
                isSelected={true}
                onSelect={mockOnSelect}
            />
        );

        const card = screen.getByRole('button');
        expect(card).toHaveAttribute('data-selected', 'true');
        expect(card).toHaveAttribute('aria-pressed', 'true');
    });

    it('should not apply selected styling when isSelected is false', () => {
        render(
            <TemplateCard
                template={mockTemplate}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        const card = screen.getByRole('button');
        expect(card).toHaveAttribute('data-selected', 'false');
        expect(card).toHaveAttribute('aria-pressed', 'false');
    });

    it('should call onSelect with template id when clicked', () => {
        render(
            <TemplateCard
                template={mockTemplate}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        fireEvent.click(screen.getByRole('button'));
        expect(mockOnSelect).toHaveBeenCalledTimes(1);
        expect(mockOnSelect).toHaveBeenCalledWith('test-template');
    });

    it('should be keyboard accessible with Enter key', () => {
        render(
            <TemplateCard
                template={mockTemplate}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        const card = screen.getByRole('button');
        fireEvent.keyDown(card, { key: 'Enter' });
        expect(mockOnSelect).toHaveBeenCalledTimes(1);
        expect(mockOnSelect).toHaveBeenCalledWith('test-template');
    });

    it('should be keyboard accessible with Space key', () => {
        render(
            <TemplateCard
                template={mockTemplate}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        const card = screen.getByRole('button');
        fireEvent.keyDown(card, { key: ' ' });
        expect(mockOnSelect).toHaveBeenCalledTimes(1);
        expect(mockOnSelect).toHaveBeenCalledWith('test-template');
    });

    it('should have proper accessibility attributes', () => {
        render(
            <TemplateCard
                template={mockTemplate}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        const card = screen.getByRole('button');
        expect(card).toHaveAttribute('tabIndex', '0');
        expect(card).toHaveAttribute('aria-label', 'Test Template: A test template for unit testing');
    });
});
