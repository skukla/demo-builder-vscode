/**
 * AddCard — "add another" as a dashed card at the end of a grid (PL-62).
 *
 * One component for every grid where an SC adds to a set. These pin what every
 * host relies on: it is a real button (name, focus, Enter/Space), it carries
 * the host's card-shape class so it sits in the grid like its neighbours, and
 * it dims with them.
 */
import { Item, Menu, Provider, defaultTheme } from '@adobe/react-spectrum';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ruleFor } from '../../../../helpers/cssRules';
import { AddCard } from '@/core/ui/components/ui/AddCard';

describe('AddCard', () => {
    it('is a focusable button named by its words', () => {
        render(<AddCard name="Add an integration" onOpen={jest.fn()} />);

        const card = screen.getByRole('button', { name: 'Add an integration' });
        expect(card).toHaveAttribute('tabindex', '0');
        expect(card).toHaveTextContent('Add an integration');
    });

    it('includes the description in its name and its text when given one', () => {
        render(<AddCard name="Add a demo package" description="From a link." onOpen={jest.fn()} />);

        const card = screen.getByRole('button', { name: 'Add a demo package: From a link.' });
        expect(card).toHaveTextContent('From a link.');
    });

    it('opens on click, Enter and Space', () => {
        const onOpen = jest.fn();
        render(<AddCard name="Add" onOpen={onOpen} />);
        const card = screen.getByRole('button', { name: 'Add' });

        fireEvent.click(card);
        fireEvent.keyDown(card, { key: 'Enter' });
        fireEvent.keyDown(card, { key: ' ' });

        expect(onOpen).toHaveBeenCalledTimes(3);
    });

    it('takes the host grid card shape beside its own class', () => {
        render(<AddCard name="Add" onOpen={jest.fn()} cardClassName="integration-card" />);

        const card = screen.getByRole('button', { name: 'Add' });
        expect(card).toHaveClass('add-card');
        expect(card).toHaveClass('integration-card');
        expect(card).not.toHaveClass('dimmed');
    });

    it('dims with its neighbours when asked', () => {
        render(<AddCard name="Add" onOpen={jest.fn()} isDimmed />);

        expect(screen.getByRole('button', { name: 'Add' })).toHaveClass('dimmed');
    });

    // jsdom loads no stylesheet, so the look is asserted on the shipped rule: the
    // dashed, see-through card on each host shape that passes its class in.
    it('is drawn dashed and see-through on every host card shape', () => {
        const rule = ruleFor(
            '.add-card:is(.expandable-brand-card, .integration-card, .integration-row, .project-card-spectrum, .project-row, .ai-prompt-card)',
        );

        expect(rule).toMatch(/border-style:\s*dashed/);
        expect(rule).toMatch(/background:\s*transparent/);
    });

    it('passes a test id through', () => {
        render(<AddCard name="Add" onOpen={jest.fn()} testId="x-add" />);

        expect(screen.getByTestId('x-add')).toBeInTheDocument();
    });

    // Your Projects' card (owner, 2026-10-05): adding there is a CHOICE, so the card
    // opens the same New / Copy / Import menu the header button did.
    describe('with a menu', () => {
        function renderWithMenu(onAction = jest.fn()) {
            render(
                <Provider theme={defaultTheme} colorScheme="light">
                    <AddCard
                        name="New project"
                        cardClassName="project-card-spectrum"
                        testId="projects-add"
                        menu={
                            <Menu onAction={onAction}>
                                <Item key="new">New Project</Item>
                                <Item key="import">Import from File</Item>
                            </Menu>
                        }
                    />
                </Provider>,
            );
            return onAction;
        }

        it('is one menu button named by its words, inside a card of the host shape', () => {
            renderWithMenu();

            const trigger = screen.getByRole('button', { name: 'New project' });
            expect(trigger.tagName).toBe('BUTTON');
            const card = screen.getByTestId('projects-add');
            expect(card).toHaveClass('add-card', 'add-card-menu', 'project-card-spectrum');
            expect(card).not.toHaveAttribute('role');
        });

        it("opens the host's menu and hands back the chosen key", async () => {
            const onAction = renderWithMenu();

            fireEvent.click(screen.getByRole('button', { name: 'New project' }));
            fireEvent.click(await screen.findByRole('menuitem', { name: 'Import from File' }));

            expect(onAction).toHaveBeenCalledWith('import');
        });

        it('fills its card, so a click anywhere on it opens the menu', () => {
            const rule = ruleFor('.add-card-menu > .add-card-trigger');

            expect(rule).toMatch(/width:\s*100%/);
            expect(rule).toMatch(/align-self:\s*stretch/);
        });
    });
});
