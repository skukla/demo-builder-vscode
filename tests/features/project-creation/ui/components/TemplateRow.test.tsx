/**
 * TemplateRow Component Tests
 *
 * Tests for the template row component used in list view.
 * Simplified design: Name + Description only (no icons, tags, or badges).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplateRow } from '@/features/project-creation/ui/components/TemplateRow';
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

describe('TemplateRow', () => {
    const mockOnSelect = jest.fn();

    beforeEach(() => {
        mockOnSelect.mockClear();
    });

    it('should render template name and description in row format', () => {
        render(
            <TemplateRow
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
            <TemplateRow
                template={mockTemplate}
                isSelected={true}
                onSelect={mockOnSelect}
            />
        );

        const row = screen.getByRole('button');
        expect(row).toHaveAttribute('data-selected', 'true');
        expect(row).toHaveAttribute('aria-pressed', 'true');
    });

    it('should not apply selected styling when isSelected is false', () => {
        render(
            <TemplateRow
                template={mockTemplate}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        const row = screen.getByRole('button');
        expect(row).toHaveAttribute('data-selected', 'false');
        expect(row).toHaveAttribute('aria-pressed', 'false');
    });

    it('should call onSelect with template id when clicked', () => {
        render(
            <TemplateRow
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
            <TemplateRow
                template={mockTemplate}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        const row = screen.getByRole('button');
        fireEvent.keyDown(row, { key: 'Enter' });
        expect(mockOnSelect).toHaveBeenCalledTimes(1);
        expect(mockOnSelect).toHaveBeenCalledWith('test-template');
    });

    it('should be keyboard accessible with Space key', () => {
        render(
            <TemplateRow
                template={mockTemplate}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        const row = screen.getByRole('button');
        fireEvent.keyDown(row, { key: ' ' });
        expect(mockOnSelect).toHaveBeenCalledTimes(1);
        expect(mockOnSelect).toHaveBeenCalledWith('test-template');
    });

    it('should have proper accessibility attributes', () => {
        render(
            <TemplateRow
                template={mockTemplate}
                isSelected={false}
                onSelect={mockOnSelect}
            />
        );

        const row = screen.getByRole('button');
        expect(row).toHaveAttribute('tabIndex', '0');
        expect(row).toHaveAttribute('aria-label', 'Test Template: A test template for unit testing');
    });
});
