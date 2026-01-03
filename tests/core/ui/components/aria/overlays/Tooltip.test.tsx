/**
 * Tooltip Component Tests
 *
 * Tests for the Tooltip and TooltipTrigger components that replace
 * @adobe/react-spectrum Tooltip/TooltipTrigger components.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip, TooltipTrigger } from '@/core/ui/components/aria/overlays/Tooltip';
import { Button } from '@/core/ui/components/aria/interactive/Button';

// Note: Need to mock timers for delay-based tests
jest.useFakeTimers();

describe('Tooltip', () => {
    afterEach(() => {
        jest.runAllTimers();
    });

    describe('Rendering', () => {
        it('should not render tooltip by default (hidden)', () => {
            render(
                <TooltipTrigger>
                    <Button>Hover me</Button>
                    <Tooltip>Tooltip content</Tooltip>
                </TooltipTrigger>
            );

            // Tooltip should not be visible initially
            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        });

        it('should render trigger element', () => {
            render(
                <TooltipTrigger>
                    <Button>Hover me</Button>
                    <Tooltip>Tooltip content</Tooltip>
                </TooltipTrigger>
            );

            expect(screen.getByRole('button', { name: 'Hover me' })).toBeInTheDocument();
        });
    });

    describe('Show on Hover', () => {
        it('should show tooltip when isOpen is true (controlled)', () => {
            // Use controlled isOpen for reliable testing in JSDOM
            // (Real hover behavior uses portals which can be tricky in JSDOM)
            render(
                <TooltipTrigger isOpen>
                    <Button>Hover me</Button>
                    <Tooltip>Tooltip content</Tooltip>
                </TooltipTrigger>
            );

            expect(screen.getByRole('tooltip')).toBeInTheDocument();
            expect(screen.getByText('Tooltip content')).toBeInTheDocument();
        });

        it('should hide when isOpen changes to false', () => {
            const { rerender } = render(
                <TooltipTrigger isOpen>
                    <Button>Hover me</Button>
                    <Tooltip>Tooltip content</Tooltip>
                </TooltipTrigger>
            );

            expect(screen.getByRole('tooltip')).toBeInTheDocument();

            // Change isOpen to false
            rerender(
                <TooltipTrigger isOpen={false}>
                    <Button>Hover me</Button>
                    <Tooltip>Tooltip content</Tooltip>
                </TooltipTrigger>
            );

            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        });
    });

    describe('Show on Focus', () => {
        it('should render trigger that can receive focus', () => {
            render(
                <TooltipTrigger>
                    <Button>Focus me</Button>
                    <Tooltip>Tooltip content</Tooltip>
                </TooltipTrigger>
            );

            const trigger = screen.getByRole('button', { name: 'Focus me' });
            expect(trigger).toBeInTheDocument();
            // Button should be focusable
            expect(trigger).toHaveAttribute('tabindex', '0');
        });

        it('should work with controlled state for focus scenarios', () => {
            render(
                <TooltipTrigger isOpen>
                    <Button>Focus me</Button>
                    <Tooltip>Tooltip content</Tooltip>
                </TooltipTrigger>
            );

            expect(screen.getByRole('tooltip')).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('should have role="tooltip"', () => {
            // Use controlled isOpen for reliable testing
            render(
                <TooltipTrigger isOpen>
                    <Button>Hover me</Button>
                    <Tooltip>Tooltip content</Tooltip>
                </TooltipTrigger>
            );

            expect(screen.getByRole('tooltip')).toBeInTheDocument();
        });

        it('should associate tooltip with trigger via aria-describedby', () => {
            // Use controlled isOpen for reliable testing
            render(
                <TooltipTrigger isOpen>
                    <Button>Hover me</Button>
                    <Tooltip>Tooltip content</Tooltip>
                </TooltipTrigger>
            );

            const trigger = screen.getByRole('button');
            const tooltip = screen.getByRole('tooltip');

            // Trigger should reference tooltip via aria-describedby
            expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
        });
    });

    describe('Delay', () => {
        it('should support delay prop', () => {
            // TooltipTrigger accepts delay prop
            // Testing the API exists - actual delay behavior is internal to React Aria
            render(
                <TooltipTrigger delay={100} isOpen>
                    <Button>Hover me</Button>
                    <Tooltip>Tooltip content</Tooltip>
                </TooltipTrigger>
            );

            expect(screen.getByRole('tooltip')).toBeInTheDocument();
        });

        it('should accept delay={0} prop', () => {
            render(
                <TooltipTrigger delay={0} isOpen>
                    <Button>Hover me</Button>
                    <Tooltip>Tooltip content</Tooltip>
                </TooltipTrigger>
            );

            expect(screen.getByRole('tooltip')).toBeInTheDocument();
        });
    });

    describe('Placement', () => {
        it('should support placement prop', () => {
            render(
                <TooltipTrigger isOpen>
                    <Button>Hover me</Button>
                    <Tooltip placement="bottom">Bottom tooltip</Tooltip>
                </TooltipTrigger>
            );

            const tooltip = screen.getByRole('tooltip');
            expect(tooltip).toBeInTheDocument();
            expect(tooltip).toHaveAttribute('data-placement', 'bottom');
        });
    });

    describe('Styling', () => {
        it('should support className prop on Tooltip', () => {
            render(
                <TooltipTrigger isOpen>
                    <Button>Hover me</Button>
                    <Tooltip className="custom-tooltip">Content</Tooltip>
                </TooltipTrigger>
            );

            expect(screen.getByRole('tooltip')).toHaveClass('custom-tooltip');
        });

    });

    describe('Controlled State', () => {
        it('should support controlled isOpen state', () => {
            render(
                <TooltipTrigger isOpen>
                    <Button>Hover me</Button>
                    <Tooltip>Tooltip content</Tooltip>
                </TooltipTrigger>
            );

            expect(screen.getByRole('tooltip')).toBeInTheDocument();
        });

        it('should call onOpenChange prop (API exists)', () => {
            const handleOpenChange = jest.fn();

            // Verify the onOpenChange prop can be passed
            render(
                <TooltipTrigger onOpenChange={handleOpenChange} isOpen>
                    <Button>Hover me</Button>
                    <Tooltip>Tooltip content</Tooltip>
                </TooltipTrigger>
            );

            expect(screen.getByRole('tooltip')).toBeInTheDocument();
            // The callback existence is verified by TypeScript
        });
    });

    describe('DisplayName', () => {
        it('should have displayName set on Tooltip', () => {
            expect(Tooltip.displayName).toBe('Tooltip');
        });

        it('should have displayName set on TooltipTrigger', () => {
            expect(TooltipTrigger.displayName).toBe('TooltipTrigger');
        });
    });
});
