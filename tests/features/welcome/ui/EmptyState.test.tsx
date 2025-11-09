import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { EmptyState } from '@/features/welcome/ui/EmptyState';
import '@testing-library/jest-dom';

describe('EmptyState', () => {
    const mockOnImport = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render "No Recent Projects" heading', () => {
        render(<EmptyState onImport={mockOnImport} />);
        expect(screen.getByText('No Recent Projects')).toBeInTheDocument();
    });

    it('should render explanation text', () => {
        render(<EmptyState onImport={mockOnImport} />);
        expect(
            screen.getByText(/You haven't opened any Demo Builder projects yet/i),
        ).toBeInTheDocument();
    });

    it('should render Import from Console button', () => {
        render(<EmptyState onImport={mockOnImport} />);
        expect(screen.getByText('Import from Console')).toBeInTheDocument();
    });

    it('should render tip text', () => {
        render(<EmptyState onImport={mockOnImport} />);
        expect(
            screen.getByText(/Tip: You can also drag and drop a console.json file/i),
        ).toBeInTheDocument();
    });

    it('should call onImport when Import button is clicked', () => {
        render(<EmptyState onImport={mockOnImport} />);

        const importButton = screen.getByText('Import from Console');
        fireEvent.click(importButton);

        expect(mockOnImport).toHaveBeenCalledTimes(1);
    });

    it('should render folder icon', () => {
        const { container } = render(<EmptyState onImport={mockOnImport} />);

        // Adobe Spectrum renders icons as SVG elements
        const svgElements = container.querySelectorAll('svg');
        expect(svgElements.length).toBeGreaterThan(0);
    });
});
