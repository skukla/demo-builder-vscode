/**
 * ResetToTemplateOption — the reset tick and the notice line beneath it.
 *
 * The label names what it resets to: the template for a shipped brand, the demo
 * by name for an added one (D21). And only one amber message shows at a time:
 * reported 2026-08-20, the default-branch notice and the reset warning both
 * showed, both amber, competing — and the reset one was WRONG in that state,
 * because "Setup cannot complete without a reset" promises a fix the reset
 * cannot deliver (`resetToTemplate` clones `--branch main`, which that repo did
 * not have). So while the repo is unusable for a reason a reset would not fix,
 * this control goes quiet.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';
import { TestWrapper } from '../components/DaLiveServiceCard.testUtils';
import { ResetToTemplateOption } from '@/features/eds/ui/steps/ResetToTemplateOption';

describe('ResetToTemplateOption — the label', () => {
    it('says "template" for a shipped brand and the demo\'s name for an added one', () => {
        const { unmount } = render(
            <ResetToTemplateOption resetToTemplate={false} onResetToTemplateChange={jest.fn()} />,
        );
        expect(screen.getByText('Reset to template (replaces all content)')).toBeInTheDocument();
        unmount();

        render(
            <ResetToTemplateOption
                resetToTemplate={false}
                onResetToTemplateChange={jest.fn()}
                templateName="Isle5 by Jen"
            />,
        );
        expect(screen.getByText('Reset to Isle5 by Jen (replaces all content)')).toBeInTheDocument();
    });
});

describe('ResetToTemplateOption — the tick', () => {
    it('reports a tick to its owner', async () => {
        const onChange = jest.fn();
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        render(
            <TestWrapper>
                <ResetToTemplateOption
                    resetToTemplate={false}
                    onResetToTemplateChange={onChange}
                    readiness={{ kind: 'storefront' }}
                />
            </TestWrapper>,
        );

        await user.click(screen.getByRole('checkbox'));

        expect(onChange).toHaveBeenCalledWith(true);
    });

    it('is locked until a repository is selected', () => {
        render(
            <TestWrapper>
                <ResetToTemplateOption
                    resetToTemplate={false}
                    onResetToTemplateChange={jest.fn()}
                    disabled
                />
            </TestWrapper>,
        );

        expect(screen.getByRole('checkbox')).toBeDisabled();
    });

    it('shows an empty repository as ticked and locked, with an info line', () => {
        render(
            <TestWrapper>
                <ResetToTemplateOption
                    resetToTemplate={false}
                    onResetToTemplateChange={jest.fn()}
                    readiness={{ kind: 'empty' }}
                />
            </TestWrapper>,
        );

        expect(screen.getByRole('checkbox')).toBeChecked();
        expect(screen.getByRole('checkbox')).toBeDisabled();
        const line = screen.getByText(/This repository is empty/);
        expect(line).toHaveClass('text-blue-600');
        expect(line.parentElement).toHaveClass('reset-warning-visible');
        expect(line.parentElement?.querySelector('svg')).toHaveClass(
            'text-blue-500',
            'flex-shrink-0',
        );
    });

    it('keeps the notice row rendered but hidden when there is nothing to say', () => {
        const { container } = render(
            <TestWrapper>
                <ResetToTemplateOption
                    resetToTemplate={false}
                    onResetToTemplateChange={jest.fn()}
                    readiness={{ kind: 'storefront' }}
                />
            </TestWrapper>,
        );

        expect(container.querySelector('.reset-warning-hidden')).toBeInTheDocument();
        expect(container.querySelector('.reset-warning-visible')).not.toBeInTheDocument();
    });

    it('warns in orange when a reset will destroy content', () => {
        render(
            <TestWrapper>
                <ResetToTemplateOption
                    resetToTemplate
                    onResetToTemplateChange={jest.fn()}
                    readiness={{ kind: 'storefront' }}
                />
            </TestWrapper>,
        );

        const line = screen.getByText(/delete and recreate the repository/);
        expect(line).toHaveClass('text-orange-600');
        expect(line.parentElement?.querySelector('svg')).toHaveClass(
            'text-orange-500',
            'flex-shrink-0',
        );
    });
});

describe('ResetToTemplateOption — one message at a time', () => {
    it('silences the reset warning when a reset cannot help', () => {
        render(
            <TestWrapper>
                <ResetToTemplateOption
                    resetToTemplate={false}
                    onResetToTemplateChange={jest.fn()}
                    readiness={{ kind: 'not-a-storefront', missing: ['head.html'] }}
                    unusable
                />
            </TestWrapper>,
        );

        expect(screen.queryByText(/Setup cannot complete without a reset/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/head\.html/i)).not.toBeInTheDocument();
    });

    it('still shows it when a reset IS the remedy', () => {
        render(
            <TestWrapper>
                <ResetToTemplateOption
                    resetToTemplate={false}
                    onResetToTemplateChange={jest.fn()}
                    readiness={{ kind: 'not-a-storefront', missing: ['head.html'] }}
                />
            </TestWrapper>,
        );

        expect(screen.getByText(/Setup cannot complete without a reset/i)).toBeInTheDocument();
    });
});
