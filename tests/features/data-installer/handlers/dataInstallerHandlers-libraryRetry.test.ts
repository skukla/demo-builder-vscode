/**
 * Demo Builder's datapack store, asked again before it counts as down (owner, 2026-11-17, walk
 * F215): a one-off 5xx or timeout never reaches a screen or an agent. Three tries; a refusal that
 * another try cannot change (a sign-in turned away, a 404) is not retried. Each retry is logged, and
 * a store still down after three says so in its answer.
 */

import * as vscode from 'vscode';
import {
    BASE,
    dataInstallerHandlers,
    makeHeadlessContext,
    MockedClient,
    resetDataInstallerHandlerMocks,
} from './dataInstallerHandlers.testUtils';
import { DataInstallerApiError } from '@/features/data-installer/services/dataInstallerErrors';

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn(async () => undefined) }));

const LIBRARY = 'https://library.example.test/api/v1/web/datapack-store';
const LIBRARY_ROW = { id: { name: 'tailspin', version: 'v1' }, shared: false, mine: true };
const INSTALLER_ROW = { id: { name: 'bodea', version: 'main' }, shared: true };
const SERVER_ERROR = () =>
    new DataInstallerApiError(
        'find-datapacks: 500 Internal Server Error: {}',
        500,
        'find-datapacks'
    );

beforeEach(() => {
    resetDataInstallerHandlerMocks();
    (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => ({
        get: jest.fn((key: string, fallback?: unknown) => {
            if (key !== 'apiBaseUrl') return fallback;
            return section === 'demoBuilder.datapackStore' ? LIBRARY : BASE;
        }),
    }));
});

/** The store answers each ask with the next of these; the Data Installer always answers. */
function storeAnswers(...answers: Array<() => Promise<unknown>>): { libraryAsks: () => number } {
    let asks = 0;
    MockedClient.mockImplementation((deps: { baseUrl: string }) => {
        const findDatapacks = jest.fn(async () => {
            if (deps.baseUrl !== LIBRARY) return { items: [INSTALLER_ROW], count: 1 };
            const answer = answers[Math.min(asks, answers.length - 1)];
            asks += 1;
            return answer();
        });
        return { findDatapacks } as unknown as InstanceType<typeof MockedClient>;
    });
    return { libraryAsks: () => asks };
}

const fails = (make: () => Error) => async () => {
    throw make();
};
const lists = async () => ({ items: [LIBRARY_ROW], count: 1 });

describe("the datapack store's list, asked again before it counts as down", () => {
    it('lists the store after one failed answer, with no banner, logging the retry', async () => {
        const store = storeAnswers(fails(SERVER_ERROR), lists);
        const context = makeHeadlessContext();

        const res = await dataInstallerHandlers['find-datapacks'](context, {});

        expect(store.libraryAsks()).toBe(2);
        expect(res).toEqual({
            success: true,
            data: {
                items: [{ ...LIBRARY_ROW, store: 'library' }, INSTALLER_ROW],
                count: 2,
                installerOn: true,
            },
        });
        expect(context.logger.warn).toHaveBeenCalledTimes(1);
    });

    it('counts the store down after three tries, and keeps the Data Installer rows', async () => {
        const store = storeAnswers(fails(SERVER_ERROR));

        const res = await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), {});

        expect(store.libraryAsks()).toBe(3);
        expect(res).toEqual({
            success: true,
            data: { items: [INSTALLER_ROW], count: 1, installerOn: true, storeMissing: true },
        });
    });

    it('says it tried three times when the store alone is asked and stays down', async () => {
        storeAnswers(fails(SERVER_ERROR));

        const res = await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), {
            store: 'library',
        });

        expect(res).toMatchObject({
            success: false,
            error: expect.stringMatching(/500 Internal Server Error.*\(tried 3 times\)$/),
        });
    });

    it('retries a timeout, as it does a server error', async () => {
        const timeout = () =>
            Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
        const store = storeAnswers(fails(timeout), lists);

        await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), { store: 'library' });

        expect(store.libraryAsks()).toBe(2);
    });

    it.each([
        ['a sign-in turned away', 403],
        ['a missing route', 404],
    ])('asks once when another try cannot change the answer: %s', async (_why, status) => {
        const store = storeAnswers(
            fails(
                () =>
                    new DataInstallerApiError(`find-datapacks: ${status}`, status, 'find-datapacks')
            )
        );

        await dataInstallerHandlers['find-datapacks'](makeHeadlessContext(), { store: 'library' });

        expect(store.libraryAsks()).toBe(1);
    });
});
