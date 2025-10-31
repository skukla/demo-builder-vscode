import React from 'react';
import { renderWithProviders, screen } from '../../../utils/react-test-utils';
import userEvent from '@testing-library/user-event';
import { Tag } from '@/webview-ui/shared/components/ui/Tag';

describe('Tag', () => {
    describe('Rendering', () => {
        it('renders tag with label', () => {
            renderWithProviders(<Tag label="React" />);
            expect(screen.getByText('React')).toBeInTheDocument();
        });

        it('renders with custom className', () => {
            const { container } = renderWithProviders(<Tag label="TypeScript" className="custom-tag" />);
            const tag = container.querySelector('.custom-tag');
            expect(tag).toBeInTheDocument();
        });
    });

    describe('Non-removable Tag', () => {
        it('renders without remove button when onRemove not provided', () => {
            renderWithProviders(<Tag label="Static Tag" />);
            expect(screen.getByText('Static Tag')).toBeInTheDocument();
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        });

        it('displays only label', () => {
            renderWithProviders(<Tag label="JavaScript" />);
            expect(screen.getByText('JavaScript')).toBeInTheDocument();
        });
    });

    describe('Removable Tag', () => {
        it('renders with remove button when onRemove provided', () => {
            const handleRemove = jest.fn();
            renderWithProviders(<Tag label="TypeScript" onRemove={handleRemove} />);

            expect(screen.getByText('TypeScript')).toBeInTheDocument();
            expect(screen.getByRole('button')).toBeInTheDocument();
        });

        it('calls onRemove when remove button clicked', async () => {
            const user = userEvent.setup();
            const handleRemove = jest.fn();
            renderWithProviders(<Tag label="React" onRemove={handleRemove} />);

            const removeButton = screen.getByRole('button');
            await user.click(removeButton);

            expect(handleRemove).toHaveBeenCalledTimes(1);
        });

        it('has accessible remove button label', () => {
            const handleRemove = jest.fn();
            renderWithProviders(<Tag label="TypeScript" onRemove={handleRemove} />);

            const removeButton = screen.getByLabelText('Remove TypeScript');
            expect(removeButton).toBeInTheDocument();
        });

        it('displays × symbol in remove button', () => {
            const handleRemove = jest.fn();
            renderWithProviders(<Tag label="Vue" onRemove={handleRemove} />);

            const removeButton = screen.getByRole('button');
            expect(removeButton).toHaveTextContent('×');
        });
    });

    describe('Styles', () => {
        it('has correct base styles', () => {
            const { container } = renderWithProviders(<Tag label="Test" />);
            const tag = container.firstChild as HTMLElement;

            expect(tag).toHaveStyle({
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 12px',
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: 500,
                lineHeight: '20px'
            });
        });

        it('remove button has correct styles', () => {
            const handleRemove = jest.fn();
            renderWithProviders(<Tag label="Test" onRemove={handleRemove} />);

            const removeButton = screen.getByRole('button');
            expect(removeButton).toHaveStyle({
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer'
            });
        });
    });

    describe('Interactions', () => {
        it('handles multiple clicks', async () => {
            const user = userEvent.setup();
            const handleRemove = jest.fn();
            renderWithProviders(<Tag label="Multi" onRemove={handleRemove} />);

            const removeButton = screen.getByRole('button');
            await user.click(removeButton);
            await user.click(removeButton);
            await user.click(removeButton);

            expect(handleRemove).toHaveBeenCalledTimes(3);
        });

        it('updates when onRemove prop changes', () => {
            const handleRemove1 = jest.fn();
            const { rerender } = renderWithProviders(<Tag label="Test" onRemove={handleRemove1} />);
            expect(screen.getByRole('button')).toBeInTheDocument();

            rerender(<Tag label="Test" />);
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        });
    });

    describe('Edge Cases', () => {
        it('renders with empty label', () => {
            renderWithProviders(<Tag label="" />);
            expect(screen.queryByText('')).not.toBeVisible();
        });

        it('renders with long label', () => {
            const longLabel = 'This is a very long tag label that might wrap';
            renderWithProviders(<Tag label={longLabel} />);
            expect(screen.getByText(longLabel)).toBeInTheDocument();
        });

        it('renders with special characters in label', () => {
            renderWithProviders(<Tag label="C++ & C#" />);
            expect(screen.getByText('C++ & C#')).toBeInTheDocument();
        });
    });
});
