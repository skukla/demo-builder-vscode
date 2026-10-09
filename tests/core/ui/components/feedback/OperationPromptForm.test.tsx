/**
 * The fields a paused operation asks for (PL-59): typed text, a box to tick, or one
 * of a few choices. Every answer is a string, so a question's values stay one shape.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { OperationPromptForm } from '@/core/ui/components/feedback/OperationPromptForm';
import type { OperationPromptField } from '@/types/webviewPayloads';

function renderForm(fields: OperationPromptField[]) {
    const onChange = jest.fn();
    render(<OperationPromptForm fields={fields} onChange={onChange} />);
    return { onChange, last: () => onChange.mock.calls.at(-1)?.[0] };
}

describe('OperationPromptForm — field kinds', () => {
    it("a checkbox starts as its value says and answers 'true' or ''", () => {
        const { last } = renderForm([
            { id: 'repo', label: 'Delete the GitHub repository', kind: 'checkbox', value: 'true' },
        ]);
        const box = screen.getByRole('checkbox');
        expect(box).toBeChecked();
        expect(last()).toEqual({ repo: 'true' });

        fireEvent.click(box);
        expect(last()).toEqual({ repo: '' });
    });

    it('a choice starts on its first option and answers the chosen id', () => {
        const { last } = renderForm([
            {
                id: 'owner',
                label: 'Where should the repository live?',
                kind: 'choice',
                options: [
                    { id: 'me', label: 'My account' },
                    { id: 'acme', label: 'acme' },
                ],
            },
        ]);
        expect(last()).toEqual({ owner: 'me' });

        fireEvent.change(screen.getByTestId('spectrum-picker-select'), { target: { value: 'acme' } });
        expect(last()).toEqual({ owner: 'acme' });
    });

    it('text stays the default kind', () => {
        const { last } = renderForm([{ id: 'name', label: 'Name', value: 'x' }]);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'y' } });
        expect(last()).toEqual({ name: 'y' });
    });
});

// Owner, 2026-10-09: deleting a project offers one box per online resource, and the
// QuickPick it replaced had a select-all; the modal had none.
describe('OperationPromptForm — select all', () => {
    const RESOURCES: OperationPromptField[] = [
        { id: 'github', label: 'Also delete the GitHub repository', kind: 'checkbox', value: '' },
        { id: 'daLive', label: 'Also delete the DA.live site', kind: 'checkbox', value: '' },
    ];

    it('offers a select-all above two or more boxes, which ticks and clears every one', () => {
        const { last } = renderForm(RESOURCES);
        const all = screen.getByRole('checkbox', { name: 'Select all' });

        fireEvent.click(all);
        expect(last()).toEqual({ github: 'true', daLive: 'true' });
        expect(screen.getByRole('checkbox', { name: 'Also delete the GitHub repository' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Also delete the DA.live site' })).toBeChecked();

        fireEvent.click(all);
        expect(last()).toEqual({ github: '', daLive: '' });
    });

    it('reads ticked when every box is, and partly ticked when only some are', () => {
        renderForm(RESOURCES);
        const all = screen.getByRole('checkbox', { name: 'Select all' });

        fireEvent.click(screen.getByRole('checkbox', { name: 'Also delete the GitHub repository' }));
        expect(all).not.toBeChecked();
        expect(all).toHaveAttribute('aria-checked', 'mixed');

        fireEvent.click(screen.getByRole('checkbox', { name: 'Also delete the DA.live site' }));
        expect(all).toBeChecked();
        expect(all).not.toHaveAttribute('aria-checked');
    });

    it('from partly ticked, ticks the rest', () => {
        const { last } = renderForm([{ ...RESOURCES[0], value: 'true' }, RESOURCES[1]]);

        fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));

        expect(last()).toEqual({ github: 'true', daLive: 'true' });
    });

    it('is not offered for a single box, and is never an answer of its own', () => {
        const { last } = renderForm([RESOURCES[0], { id: 'name', label: 'Name', value: 'x' }]);

        expect(screen.queryByRole('checkbox', { name: 'Select all' })).toBeNull();
        expect(Object.keys(last() ?? {})).toStrictEqual(['github', 'name']);
    });
});

