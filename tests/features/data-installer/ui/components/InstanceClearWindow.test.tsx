/**
 * Clear Commerce Instance's two windows (datapack-simplification step 06, C4; J1-4 and J1-5 in
 * `mockups/flow/j1-windows.tsx`): tick websites, each naming the projects using it, then Next; then
 * the summary, the warning (what can't be undone, and what can) and "I understand", which the red
 * button waits for. A project's datapack with changes brings the batch save question first (P6-Q4).
 * Every request and the clearing are asserted by their payloads.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';
import {
    INSTANCE_CHECK,
    INSTANCE_CHECK_NO_CHANGES,
    INSTANCE_CHOICES,
} from '../../../../helpers/clearCheckFixtures';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { InstanceClearWindow } from '@/features/data-installer/ui/components/InstanceClearWindow';
import type { ClearCheck, DemoDataRequest } from '@/types/demoDataWipe';
import type { HandlerResponse } from '@/types/handlers';

const mockRequest = webviewClient.request as jest.Mock;

/** The instance's websites for `websites: []`, the check given for codes. */
function answering(...answers: ClearCheck[]): void {
    const queue = answers.length > 0 ? [...answers] : [INSTANCE_CHECK];
    mockRequest.mockReset();
    mockRequest.mockImplementation(
        async (type: string, payload?: DemoDataRequest): Promise<HandlerResponse> => {
            if (type !== 'check-demo-data') return { success: true };
            if (payload?.websites?.length === 0) return { success: true, data: INSTANCE_CHOICES };
            // One answer per asking, the last again from then on.
            return { success: true, data: queue.length > 1 ? queue.shift() : queue[0] };
        }
    );
}

const checks = (): unknown[] =>
    mockRequest.mock.calls.filter((c) => c[0] === 'check-demo-data').map((c) => c[1]);
const button = (name: string | RegExp): HTMLElement => screen.getByRole('button', { name });
const box = (name: string | RegExp): HTMLElement => screen.getByRole('checkbox', { name });

async function openWindow(onClear: jest.Mock = jest.fn()) {
    const onClose = jest.fn();
    render(<InstanceClearWindow onClose={onClose} onClear={onClear} />);
    await settle();
    return { onClear, onClose };
}

/** Tick Main Website, press Next, and wait for the summary. */
async function toSummary(): Promise<void> {
    await press(box(/Main Website/));
    await press(button('Next'));
    await settle();
}

beforeEach(() => answering());

describe('choosing websites', () => {
    it("asks once for the instance's websites, in a window titled Clear Commerce Instance", async () => {
        await openWindow();

        expect(checks()).toEqual([{ websites: [] }]);
        expect(
            screen.getByRole('heading', { name: 'Clear Commerce Instance' })
        ).toBeInTheDocument();
    });

    it('names the projects using each website, two then how many more, and nothing for a website none uses', async () => {
        await openWindow();

        expect(screen.getByText('Used by Kukla Luma and Luma Test')).toBeInTheDocument();
        expect(screen.getByText('Used by Bodea, Bodea EU and 2 more')).toBeInTheDocument();
        expect(screen.queryByText(/Used by\s*$/)).not.toBeInTheDocument();
        expect(screen.getAllByText(/^Used by/)).toHaveLength(2);
    });

    it('keeps Next off until a website is ticked', async () => {
        await openWindow();
        expect(button('Next')).toHaveAttribute('aria-disabled', 'true');

        await press(box(/Spare/));

        expect(button('Next')).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('ticks every website with Select All, and Next asks for exactly those', async () => {
        await openWindow();

        await press(box('Select All'));
        await press(button('Next'));
        await settle();

        expect(checks()[1]).toEqual({ websites: ['base', 'bodea', 'spare'] });
    });
});

describe('the summary', () => {
    it('is titled by how many websites, names them, and warns what cannot be undone and what can', async () => {
        await openWindow();
        await toSummary();

        expect(screen.getByRole('heading', { name: 'Clear 1 Website?' })).toBeInTheDocument();
        expect(
            screen.getByText('Clears everything on Main Website, whichever project put it there.')
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "2 projects lose their demo data. This can't be undone, except the datapacks: their changes are saved first, and each can be installed again from the library."
            )
        ).toBeInTheDocument();
    });

    it('holds the red button until "I understand" is ticked', async () => {
        await openWindow();
        await toSummary();
        expect(button('Clear 1 Website')).toHaveAttribute('aria-disabled', 'true');

        await press(box('I understand every project on these websites loses its data'));

        expect(button('Clear 1 Website')).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('goes Back to the websites still ticked, with "I understand" unticked again', async () => {
        await openWindow();
        await toSummary();
        await press(box(/I understand/));

        await press(button('Back'));
        expect(box(/Main Website/)).toBeChecked();
        await press(button('Next'));
        await settle();

        expect(box(/I understand/)).not.toBeChecked();
    });

    it('clears with the token and the websites, and no answers, when no datapack has changes', async () => {
        answering(INSTANCE_CHECK_NO_CHANGES);
        const { onClear } = await openWindow();
        await toSummary();
        await press(box(/I understand/));

        await press(button('Clear 1 Website'));

        expect(onClear).toHaveBeenCalledWith('instance-tok-1', ['base'], {});
    });
});

describe('the batch save question (P6-Q4)', () => {
    async function asked(onClear = jest.fn()) {
        const opened = await openWindow(onClear);
        await toSummary();
        await press(box(/I understand/));
        await press(button('Clear 1 Website'));
        return opened;
    }

    it("comes before the clearing, a row per datapack with changes, its name past the SC's own", async () => {
        const { onClear } = await asked();

        expect(onClear).not.toHaveBeenCalled();
        expect(
            screen.getByRole('heading', { name: 'Save Your Changes First?' })
        ).toBeInTheDocument();
        expect(screen.getByText('Luma')).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'Save As, Kukla Luma' })).toHaveValue(
            'My Luma 2'
        );
        expect(
            screen.queryByRole('textbox', { name: 'Save As, Luma Test' })
        ).not.toBeInTheDocument();
    });

    it('hands each answer by project path: Save and Clear', async () => {
        const { onClear } = await asked();

        await press(button('Save and Clear'));

        expect(onClear).toHaveBeenCalledWith('instance-tok-1', ['base'], {
            '/p/kukla-luma': { saveAs: 'My Luma 2' },
        });
    });

    it('hands each answer by project path: Clear Without Saving', async () => {
        const { onClear } = await asked();

        await press(button('Clear Without Saving'));

        expect(onClear).toHaveBeenCalledWith('instance-tok-1', ['base'], {
            '/p/kukla-luma': 'drop',
        });
    });

    it("holds the save while a name is one of the SC's own", async () => {
        await asked();
        const field = screen.getByRole('textbox', { name: 'Save As, Kukla Luma' });
        fireEvent.change(field, { target: { value: 'my luma' } });
        await settle();

        expect(screen.getByText('You already have a datapack named my luma.')).toBeInTheDocument();
        expect(button('Save and Clear')).toHaveAttribute('aria-disabled', 'true');
    });
});

describe('a list read again (review items 5 and 6)', () => {
    const SLOW: ClearCheck = { ...INSTANCE_CHECK_NO_CHANGES, token: 'instance-slow', unread: { companies: 'slow' }, problem: "Commerce didn't answer for Companies." };
    const AGAIN: ClearCheck = { ...INSTANCE_CHECK_NO_CHANGES, token: 'instance-again' };

    it('unticks "I understand" when Retry brings a new list', async () => {
        answering(SLOW, AGAIN);
        await openWindow();
        await toSummary();
        await press(box(/I understand/));

        await press(button('Retry'));
        await settle();

        expect(checks()).toHaveLength(3);
        expect(box(/I understand/)).not.toBeChecked();
    });

    it('reads the list again, and asks "I understand" again, when the clearing found changes needing an answer', async () => {
        answering(INSTANCE_CHECK_NO_CHANGES, AGAIN);
        const onClear = jest.fn().mockResolvedValue(true);
        await openWindow(onClear);
        await toSummary();
        await press(box(/I understand/));

        await press(button('Clear 1 Website'));
        await settle();

        expect(checks()[2]).toEqual({ websites: ['base'] });
        expect(box(/I understand/)).not.toBeChecked();
        expect(screen.queryByRole('heading', { name: 'Save Your Changes First?' })).not.toBeInTheDocument();
    });

    it('asks a name for a datapack whose changes could not be read, so a change found later has an answer', async () => {
        const unread: ClearCheck = {
            ...INSTANCE_CHECK_NO_CHANGES,
            instance: { projects: [{ path: '/p/luma-test', name: 'Luma Test', datapack: { name: 'Luma Test Pack', changes: 'unchecked' } }], ownNames: [], alwaysSave: false },
        };
        answering(unread);
        await openWindow();
        await toSummary();
        await press(box(/I understand/));

        await press(button('Clear 1 Website'));

        expect(screen.getByRole('textbox', { name: 'Save As, Luma Test' })).toHaveValue('My Luma Test Pack');
    });

    it('says which projects keep their data, and counts only those that lose it', async () => {
        const kept = 'Luma Test keeps its datapack Luma Test Pack, which is also on the website bodea, and its data on these websites.';
        answering({ ...INSTANCE_CHECK, instance: { ownNames: [], alwaysSave: false, projects: [{ path: '/p/kukla-luma', name: 'Kukla Luma' }, { path: '/p/luma-test', name: 'Luma Test', kept }] } });
        await openWindow();
        await toSummary();

        expect(screen.getByText(kept)).toBeInTheDocument();
        expect(screen.getByText(/^1 project loses its demo data\./)).toBeInTheDocument();
    });
});
