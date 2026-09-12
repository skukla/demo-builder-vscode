/**
 * GitHubLinkField: one field, two messages, the parsed source out.
 * (The Add Integration flow's `CustomStage` suite covers the field under its own words.)
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { GitHubLinkField, evaluateGitHubLink } from '@/core/ui/components/forms/GitHubLinkField';
import '@testing-library/jest-dom';

const MESSAGES = { invalid: 'Enter a GitHub link', duplicate: 'Already added' };

describe('evaluateGitHubLink', () => {
    it('parses a link, and calls the two failures by their messages', () => {
        expect(evaluateGitHubLink('https://github.com/jen/isle5-demo', () => false, MESSAGES)).toEqual({
            source: { owner: 'jen', repo: 'isle5-demo' },
        });
        expect(evaluateGitHubLink('not a link', () => false, MESSAGES)).toEqual({ message: 'Enter a GitHub link' });
        expect(evaluateGitHubLink('https://github.com/jen/isle5-demo', () => true, MESSAGES)).toEqual({
            message: 'Already added',
        });
        expect(evaluateGitHubLink('   ', () => false, MESSAGES)).toStrictEqual({});
    });
});

describe('GitHubLinkField', () => {
    function renderField(isDuplicate = () => false) {
        const onSourceChange = jest.fn();
        render(
            <GitHubLinkField
                label="Link to the demo"
                placeholder="https://github.com/name/demo"
                invalidMessage={MESSAGES.invalid}
                duplicateMessage={MESSAGES.duplicate}
                isDuplicate={isDuplicate}
                onSourceChange={onSourceChange}
            />,
        );
        return { onSourceChange, input: screen.getByPlaceholderText('https://github.com/name/demo') };
    }

    it('emits the parsed source for a link and undefined with the message otherwise', () => {
        const { onSourceChange, input } = renderField();
        fireEvent.change(input, { target: { value: 'https://github.com/jen/isle5-demo' } });
        expect(onSourceChange).toHaveBeenLastCalledWith({ owner: 'jen', repo: 'isle5-demo' });
        fireEvent.change(input, { target: { value: 'nope' } });
        expect(onSourceChange).toHaveBeenLastCalledWith(undefined);
        expect(screen.getByTestId('spectrum-textfield-error')).toHaveTextContent('Enter a GitHub link');
    });

    it("shows the duplicate message from the caller's rule", () => {
        const { input } = renderField(() => true);
        fireEvent.change(input, { target: { value: 'https://github.com/jen/isle5-demo' } });
        expect(screen.getByTestId('spectrum-textfield-error')).toHaveTextContent('Already added');
    });
});
