/**
 * TemplateCard Component Tests
 *
 * Tests for the simplified template card component used in grid view.
 * Matches ProjectCard styling for visual consistency.
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
        expect(card).toHaveClass('template-card-selected');
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
        expect(card).not.toHaveClass('template-card-selected');
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

    it('should use project-card-spectrum class for consistency', () => {
        render(
            <TemplateCard
                template={mockTemplate}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        const card = screen.getByRole('button');
        expect(card).toHaveClass('project-card-spectrum');
    });
});
