/**
 * progressRegister — the shared register split.
 *
 * Extracted 2026-08-04 after the split was implemented twice and reversed once:
 * `withComponentProgress` was updated, `deployMeshWithFeedback` was not, and a
 * mesh redeploy kept narrating the old way. The duplicated thing was a DECISION
 * rather than a block of code, so nothing flagged it.
 *
 * These tests pin the decision itself. The two callers keep their own tests for
 * the channels and extras they own.
 */

import * as vscode from 'vscode';
import { cardInFlightLabel, withProgressRegister } from '@/core/vscode/progressRegister';

/** Capture the reporter withProgress hands the task. */
function stubWithProgress(): { report: jest.Mock; options: () => { title?: string } } {
    const report = jest.fn();
    let seen: { title?: string } = {};
    (vscode.window.withProgress as unknown as jest.Mock).mockImplementation(
        async (options: { title: string }, task: (p: unknown) => Promise<unknown>) => {
            seen = options;
            return task({ report });
        }
    );
    return { report, options: () => seen };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('cardInFlightLabel', () => {
    it('is the verb plus the KIND, never the component name', () => {
        expect(cardInFlightLabel('Deploying', 'Mesh')).toBe('Deploying Mesh');
        expect(cardInFlightLabel('Adding', 'Integration')).toBe('Adding Integration');
    });
});

describe('withProgressRegister', () => {
    it('sends every step to the notification', async () => {
        const { report } = stubWithProgress();

        await withProgressRegister(
            { title: 'Deploying API Mesh', cardLabel: 'Deploying Mesh', pushCardStatus: jest.fn() },
            async (step) => {
                step('Reading mesh configuration...');
                step('Deploying...');
            }
        );

        expect(report).toHaveBeenCalledWith({ message: 'Reading mesh configuration...' });
        expect(report).toHaveBeenCalledWith({ message: 'Deploying...' });
    });

    it('tells the card once, and only the label', async () => {
        stubWithProgress();
        const pushCardStatus = jest.fn();

        await withProgressRegister(
            { title: 'Deploying API Mesh', cardLabel: 'Deploying Mesh', pushCardStatus },
            async (step) => {
                step('Reading mesh configuration...');
                step('Deploying...');
            }
        );

        expect(pushCardStatus).toHaveBeenCalledTimes(1);
        expect(pushCardStatus).toHaveBeenCalledWith('Deploying Mesh');
    });

    // The card is told BEFORE the work starts: a slow first step (the auth check
    // costs seconds on a cold cache) would otherwise leave the card silent while
    // the notification already showed a spinner.
    it('tells the card before running the work', async () => {
        stubWithProgress();
        const order: string[] = [];

        await withProgressRegister(
            {
                title: 'Deploying API Mesh',
                cardLabel: 'Deploying Mesh',
                pushCardStatus: () => order.push('card'),
            },
            async () => {
                order.push('work');
            }
        );

        expect(order).toEqual(['card', 'work']);
    });

    it('keeps the operation name on the notification title', async () => {
        const { options } = stubWithProgress();

        await withProgressRegister(
            { title: 'Deploying API Mesh', cardLabel: 'Deploying Mesh', pushCardStatus: jest.fn() },
            async () => undefined
        );

        expect(options().title).toBe('Deploying API Mesh');
    });

    // Taken from inside the task, not from withProgress's return value, so the
    // caller gets it regardless of what the notification host does with it.
    it('returns the work’s result', async () => {
        stubWithProgress();

        const result = await withProgressRegister(
            { title: 't', cardLabel: 'l', pushCardStatus: jest.fn() },
            async () => ({ success: true, id: 'mesh-1' })
        );

        expect(result).toEqual({ success: true, id: 'mesh-1' });
    });
});
