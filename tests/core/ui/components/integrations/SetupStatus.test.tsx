/**
 * SetupStatus — "Demo setup · N of M done" while an integration's demo setup has steps
 * open (AB-26x), as a link that opens the guide. The words and the link are pinned here;
 * that the card and the grid show them is pinned in IntegrationsGrid-setupGuide.test.tsx.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import {
    SetupStatus,
    setupStatusText,
    setupSummary,
} from '@/core/ui/components/integrations/SetupStatus';
import type { IntegrationCardModel } from '@/core/ui/components/integrations/integrationCardModel.types';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';
import '@testing-library/jest-dom';

const step = (id: string, state: SetupChecklistItem['state']): SetupChecklistItem => ({
    id,
    title: id,
    why: 'why',
    where: 'where',
    state,
    checkable: false,
});

const model = (items?: SetupChecklistItem[]) => ({ id: 'erp-integration', setupChecklist: items }) as IntegrationCardModel;

describe('setupSummary', () => {
    it('counts done out of the steps not dismissed', () => {
        expect(setupSummary([step('a', 'done'), step('b', 'open'), step('c', 'dismissed')])).toBe('1 of 2 done');
    });

    it('leaves an open optional step out of the count, and counts it once done', () => {
        const optional = (state: SetupChecklistItem['state']) => ({ ...step('o', state), optional: true });
        expect(setupSummary([step('a', 'done'), step('b', 'open'), optional('open')])).toBe('1 of 2 done');
        expect(setupSummary([step('a', 'done'), step('b', 'open'), optional('done')])).toBe('2 of 3 done');
        expect(setupSummary([step('a', 'done'), optional('open')])).toBe('All done');
    });

    it('says all done when nothing is open', () => {
        expect(setupSummary([step('a', 'done'), step('b', 'dismissed')])).toBe('All done');
    });
});

describe('setupStatusText', () => {
    it('says how far through the setup is, in the flyout\'s words', () => {
        expect(setupStatusText(model([step('a', 'open'), step('b', 'done'), step('c', 'open')]))).toBe(
            'Demo setup · 1 of 3 done',
        );
    });

    it('says nothing once every step is done or skipped', () => {
        expect(setupStatusText(model([step('a', 'done'), step('b', 'dismissed')]))).toBeUndefined();
    });

    it('says nothing when only optional steps are open', () => {
        expect(setupStatusText(model([step('a', 'done'), { ...step('o', 'open'), optional: true }]))).toBeUndefined();
    });

    it('says nothing for an integration without steps', () => {
        expect(setupStatusText(model())).toBeUndefined();
    });
});

describe('SetupStatus', () => {
    it('opens the setup guide, and the press does not reach the card behind it', () => {
        const onAction = jest.fn();
        const onCardClick = jest.fn();
        const m = model([step('a', 'open')]);
        render(
            // Stands in for the card, whose own click opens the flyout.
            <div onClick={onCardClick}>
                <SetupStatus model={m} onAction={onAction} />
            </div>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Demo setup · 0 of 1 done' }));

        expect(onAction).toHaveBeenCalledWith(m, 'setup-guide');
        expect(onCardClick).not.toHaveBeenCalled();
    });

    it('renders nothing when no step is open', () => {
        const { container } = render(<SetupStatus model={model([step('a', 'done')])} onAction={jest.fn()} />);

        expect(container).toBeEmptyDOMElement();
    });
});
