/**
 * ChoiceCard — the shared selectable "choice card" primitive.
 *
 * Encapsulates the `.choice-card` markup + variants so callers pass props instead of
 * hand-writing buttons/spans/CSS. These tests lock the interface: name/description/note,
 * the row vs tile variant, selected (✓ + data-selected), and disabled (not clickable).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { ChoiceCard } from '@/features/project-creation/ui/components/ChoiceCard';

const renderCard = (ui: React.ReactElement) =>
    render(<Provider theme={defaultTheme}>{ui}</Provider>);

describe('ChoiceCard', () => {
    it('renders the name, description, and note', () => {
        renderCard(
            <ChoiceCard name="Pre-built" description="From the catalog" note="None available yet" />,
        );
        expect(screen.getByText('Pre-built')).toBeInTheDocument();
        expect(screen.getByText('From the catalog')).toBeInTheDocument();
        expect(screen.getByText('None available yet')).toBeInTheDocument();
    });

    it('defaults to the row variant; tile variant adds the tile class', () => {
        const { rerender, container } = renderCard(<ChoiceCard name="A" />);
        expect(container.querySelector('.choice-card')).not.toHaveClass('choice-card--tile');

        rerender(
            <Provider theme={defaultTheme}>
                <ChoiceCard name="A" variant="tile" />
            </Provider>,
        );
        expect(container.querySelector('.choice-card')).toHaveClass('choice-card--tile');
    });

    it('when selected: sets data-selected and renders the check', () => {
        const { container } = renderCard(
            <ChoiceCard name="A" selected checkTestId="a-check" />,
        );
        expect(container.querySelector('[data-selected="true"]')).toBeInTheDocument();
        expect(screen.getByTestId('a-check')).toBeInTheDocument();
    });

    it('fires onSelect when clicked and enabled', () => {
        const onSelect = jest.fn();
        renderCard(<ChoiceCard name="A" testId="card-a" onSelect={onSelect} />);
        fireEvent.click(screen.getByTestId('card-a'));
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    // Both props exist because two callers had hand-rolled the whole card to get
    // them (2026-08-05). Neither was a variant — each was this component plus one
    // attribute it did not expose.
    it('exposes a test id on the note, for callers that assert on it', () => {
        render(<ChoiceCard name="ACCS" note="Not available" noteTestId="backend-note-accs" />);
        expect(screen.getByTestId('backend-note-accs')).toHaveTextContent('Not available');
    });

    it('sets aria-pressed only when `pressed` is given (toggle vs pick-one)', () => {
        // A multi-select toggle must announce its state; a pick-one must NOT, or
        // every card in a radio group claims to be a pressed toggle.
        const { rerender } = render(<ChoiceCard name="Lib" pressed={false} />);
        expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');

        rerender(<ChoiceCard name="Lib" pressed />);
        expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');

        rerender(<ChoiceCard name="Lib" />);
        expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed');
    });

    it('when disabled: is not clickable and does not fire onSelect', () => {
        const onSelect = jest.fn();
        renderCard(<ChoiceCard name="A" testId="card-a" disabled onSelect={onSelect} />);
        const button = screen.getByTestId('card-a');
        expect(button).toBeDisabled();
        fireEvent.click(button);
        expect(onSelect).not.toHaveBeenCalled();
    });
});
