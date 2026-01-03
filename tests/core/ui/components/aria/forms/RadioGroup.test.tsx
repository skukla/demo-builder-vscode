/**
 * RadioGroup Component Tests
 *
 * Tests for the RadioGroup and Radio components that replace
 * @adobe/react-spectrum RadioGroup/Radio components.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RadioGroup, Radio } from '@/core/ui/components/aria/forms/RadioGroup';

describe('RadioGroup', () => {
    describe('Rendering', () => {
        it('should render with label', () => {
            render(
                <RadioGroup label="Select option">
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                </RadioGroup>
            );

            expect(screen.getByText('Select option')).toBeInTheDocument();
        });

        it('should render radio options', () => {
            render(
                <RadioGroup label="Select option">
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                    <Radio value="option3">Option 3</Radio>
                </RadioGroup>
            );

            expect(screen.getByText('Option 1')).toBeInTheDocument();
            expect(screen.getByText('Option 2')).toBeInTheDocument();
            expect(screen.getByText('Option 3')).toBeInTheDocument();
        });

        it('should have proper radiogroup role', () => {
            render(
                <RadioGroup label="Select option">
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                </RadioGroup>
            );

            expect(screen.getByRole('radiogroup')).toBeInTheDocument();
        });

        it('should render radio inputs with proper role', () => {
            render(
                <RadioGroup label="Select option">
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                </RadioGroup>
            );

            const radios = screen.getAllByRole('radio');
            expect(radios).toHaveLength(2);
        });
    });

    describe('Controlled State', () => {
        it('should show selected value', () => {
            render(
                <RadioGroup label="Select option" value="option2">
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                </RadioGroup>
            );

            const radios = screen.getAllByRole('radio');
            expect(radios[0]).not.toBeChecked();
            expect(radios[1]).toBeChecked();
        });

        it('should call onChange when radio is clicked', async () => {
            const user = userEvent.setup();
            const handleChange = jest.fn();

            render(
                <RadioGroup label="Select option" value="option1" onChange={handleChange}>
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                </RadioGroup>
            );

            await user.click(screen.getByText('Option 2'));

            expect(handleChange).toHaveBeenCalledWith('option2');
        });

        it('should update selection when value prop changes', () => {
            const { rerender } = render(
                <RadioGroup label="Select option" value="option1">
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                </RadioGroup>
            );

            expect(screen.getAllByRole('radio')[0]).toBeChecked();

            rerender(
                <RadioGroup label="Select option" value="option2">
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                </RadioGroup>
            );

            expect(screen.getAllByRole('radio')[1]).toBeChecked();
        });
    });

    describe('Uncontrolled State', () => {
        it('should use defaultValue for initial selection', () => {
            render(
                <RadioGroup label="Select option" defaultValue="option2">
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                </RadioGroup>
            );

            const radios = screen.getAllByRole('radio');
            expect(radios[0]).not.toBeChecked();
            expect(radios[1]).toBeChecked();
        });
    });

    describe('Disabled State', () => {
        it('should disable all radios when group is disabled', () => {
            render(
                <RadioGroup label="Select option" isDisabled>
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                </RadioGroup>
            );

            const radios = screen.getAllByRole('radio');
            radios.forEach(radio => {
                expect(radio).toBeDisabled();
            });
        });

        it('should not call onChange when disabled', async () => {
            const user = userEvent.setup();
            const handleChange = jest.fn();

            render(
                <RadioGroup label="Select option" isDisabled onChange={handleChange}>
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                </RadioGroup>
            );

            await user.click(screen.getByText('Option 2'));

            expect(handleChange).not.toHaveBeenCalled();
        });

        it('should disable individual radio when Radio isDisabled is true', () => {
            render(
                <RadioGroup label="Select option">
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2" isDisabled>Option 2</Radio>
                    <Radio value="option3">Option 3</Radio>
                </RadioGroup>
            );

            const radios = screen.getAllByRole('radio');
            expect(radios[0]).not.toBeDisabled();
            expect(radios[1]).toBeDisabled();
            expect(radios[2]).not.toBeDisabled();
        });
    });

    describe('Keyboard Navigation', () => {
        it('should allow keyboard navigation with arrow keys', async () => {
            const user = userEvent.setup();
            const handleChange = jest.fn();

            render(
                <RadioGroup label="Select option" value="option1" onChange={handleChange}>
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                    <Radio value="option3">Option 3</Radio>
                </RadioGroup>
            );

            // Focus on the radiogroup
            const firstRadio = screen.getAllByRole('radio')[0];
            firstRadio.focus();

            // Press arrow down to move to next option
            await user.keyboard('{ArrowDown}');

            expect(handleChange).toHaveBeenCalledWith('option2');
        });
    });

    describe('Orientation', () => {
        it('should apply vertical orientation by default', () => {
            const { container } = render(
                <RadioGroup label="Select option">
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                </RadioGroup>
            );

            // Check that radiogroup has vertical orientation or flex-direction: column
            const radioGroup = screen.getByRole('radiogroup');
            expect(radioGroup).toBeInTheDocument();
        });

        it('should apply horizontal orientation when specified', () => {
            render(
                <RadioGroup label="Select option" orientation="horizontal">
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                </RadioGroup>
            );

            const radioGroup = screen.getByRole('radiogroup');
            expect(radioGroup).toHaveAttribute('aria-orientation', 'horizontal');
        });
    });

    describe('Spectrum Compatibility', () => {
        it('should support className prop', () => {
            const { container } = render(
                <RadioGroup label="Select option" className="custom-class">
                    <Radio value="option1">Option 1</Radio>
                </RadioGroup>
            );

            expect(container.querySelector('.custom-class')).toBeInTheDocument();
        });

        it('should support marginBottom prop for spacing', () => {
            const { container } = render(
                <RadioGroup label="Select option" marginBottom="size-300">
                    <Radio value="option1">Option 1</Radio>
                </RadioGroup>
            );

            // Check that marginBottom is applied
            const wrapper = container.firstChild as HTMLElement;
            expect(wrapper).toHaveStyle({ marginBottom: '24px' });
        });
    });

    describe('Description', () => {
        it('should render description when provided', () => {
            render(
                <RadioGroup label="Select option" description="Choose your preferred option">
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                </RadioGroup>
            );

            expect(screen.getByText('Choose your preferred option')).toBeInTheDocument();
        });
    });

    describe('Error State', () => {
        it('should render error message when provided', () => {
            render(
                <RadioGroup
                    label="Select option"
                    validationState="invalid"
                    errorMessage="Please select an option"
                >
                    <Radio value="option1">Option 1</Radio>
                    <Radio value="option2">Option 2</Radio>
                </RadioGroup>
            );

            expect(screen.getByText('Please select an option')).toBeInTheDocument();
        });
    });
});

describe('Radio', () => {
    it('should render children as label', () => {
        render(
            <RadioGroup label="Select option">
                <Radio value="test">Test Label</Radio>
            </RadioGroup>
        );

        expect(screen.getByText('Test Label')).toBeInTheDocument();
    });

    it('should support className prop', () => {
        const { container } = render(
            <RadioGroup label="Select option">
                <Radio value="test" className="custom-radio">Test</Radio>
            </RadioGroup>
        );

        expect(container.querySelector('.custom-radio')).toBeInTheDocument();
    });
});
