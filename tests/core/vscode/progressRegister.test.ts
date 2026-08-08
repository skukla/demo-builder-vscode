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

/**
 * Card-less callers (2026-08-07).
 *
 * The register's value is "steps reach the notification"; the card half belongs to
 * the surfaces that HAVE cards. A project-scoped operation — changing the Adobe
 * deploy destination — has none, and was passing `cardLabel: ''` with a no-op
 * `pushCardStatus` to satisfy the type. Stubbing required parameters to opt out of
 * them is a sign the contract is wrong, not the caller.
 *
 * The update notifications reach for raw `vscode.window.withProgress` for the same
 * reason. Making the card half optional lets one helper serve both honestly.
 */
describe('withProgressRegister — operations with no card', () => {
    it('runs and reports steps without any card options', async () => {
        const vscode = require('vscode');
        const report = jest.fn();
        vscode.window.withProgress.mockImplementation(
            async (_o: unknown, task: (p: unknown) => unknown) => task({ report }),
        );

        const result = await withProgressRegister({ title: 'Changing destination' }, async (step) => {
            step('Checking requirements…');
            return 'done';
        });

        expect(result).toBe('done');
        expect(report).toHaveBeenCalledWith({ message: 'Checking requirements…' });
    });

    it('still pushes the card line when a card IS supplied', async () => {
        const vscode = require('vscode');
        vscode.window.withProgress.mockImplementation(
            async (_o: unknown, task: (p: unknown) => unknown) => task({ report: jest.fn() }),
        );
        const pushCardStatus = jest.fn();

        await withProgressRegister(
            { title: 'Deploying', cardLabel: 'Deploying Mesh…', pushCardStatus },
            async () => undefined,
        );

        expect(pushCardStatus).toHaveBeenCalledWith('Deploying Mesh…');
    });
});
