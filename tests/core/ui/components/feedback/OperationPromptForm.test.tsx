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
