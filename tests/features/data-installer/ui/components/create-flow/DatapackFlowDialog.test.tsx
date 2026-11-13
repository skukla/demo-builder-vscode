/**
 * DatapackFlowDialog's windows are sized to what they show (owner, 2026-11-11): Create's name, its
 * second window (step-04 S3), is never padded to the height of the two-column picks, and the picks
 * are a window of their own, measured with their room from the first frame. The flow's state is
 * stood in for; the real StepsWindow and Modal draw the room, and the test reads what was in the
 * box at the one moment its height was taken.
 */

import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render } from '@testing-library/react';
import React from 'react';
import { DatapackFlowDialog } from '@/features/data-installer/ui/components/create-flow/DatapackFlowDialog';
import type { CreateDatapackFlow } from '@/features/data-installer/ui/components/create-flow/useCreateDatapackFlow';

let flow: CreateDatapackFlow;
jest.mock('@/features/data-installer/ui/components/create-flow/useCreateDatapackFlow', () => ({
    useCreateDatapackFlow: () => flow,
}));
jest.mock('@/features/data-installer/ui/components/create-flow/stages/StorePicksStage', () => ({
    StorePicksStage: () => <p>The picks</p>,
}));

function flowAt(stage: CreateDatapackFlow['stage']): CreateDatapackFlow {
    // Only what the window reads; the hook's own suite covers the rest of its state.
    return {
        stage,
        answers: {},
        main: { label: 'Create', onPress: jest.fn() },
        waiting: false,
        canGoBack: false,
        name: 'My Bodea',
        setName: jest.fn(),
        nameRoom: 'You already have a datapack named My Luma.',
    } as unknown as CreateDatapackFlow;
}

/** For each time the window took its height: whether the picks' room was in the box then. */
let picksRoomWhenMeasured: boolean[];
/** For each time the window took its height: the hidden copy's text, the room it held. */
let roomWhenMeasured: string[];

function renderAt(stage: CreateDatapackFlow['stage']): void {
    flow = flowAt(stage);
    render(
        <Provider theme={defaultTheme}>
            <DatapackFlowDialog title="Create Datapack" ownNames={['My Luma']} onClose={jest.fn()} onSave={jest.fn()} />
        </Provider>,
    );
}

describe('DatapackFlowDialog window size', () => {
    const realAnimate = HTMLElement.prototype.animate;
    const realRect = HTMLElement.prototype.getBoundingClientRect;
    beforeEach(() => {
        picksRoomWhenMeasured = [];
        roomWhenMeasured = [];
        HTMLElement.prototype.animate = jest.fn(() => ({ cancel: jest.fn() })) as unknown as HTMLElement['animate'];
        HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement) {
            if (this.classList.contains('modal-dialog')) {
                picksRoomWhenMeasured.push(this.querySelector('.modal-steps-ghost .datapack-picks') !== null);
                roomWhenMeasured.push(Array.from(this.querySelectorAll('.modal-steps-ghost')).map((ghost) => ghost.textContent).join('|'));
            }
            return { height: 400, width: 600 } as DOMRect;
        };
    });
    afterEach(() => {
        HTMLElement.prototype.animate = realAnimate;
        HTMLElement.prototype.getBoundingClientRect = realRect;
    });

    it('sizes the name window to its field, holding no room for the picks', () => {
        renderAt('create-name');

        expect(picksRoomWhenMeasured).toEqual([false]);
    });

    // Rule 14: a refusal arriving under the name moves nothing, so its room is in the first measure.
    it('measures the name window with room for its longest refusal', () => {
        renderAt('create-name');

        expect(roomWhenMeasured).toHaveLength(1);
        expect(roomWhenMeasured[0]).toContain('You already have a datapack named My Luma.');
    });

    it('opens the picks as their own window, measured with the picks room', () => {
        renderAt('store-picks');

        expect(picksRoomWhenMeasured).toEqual([true]);
    });
});
