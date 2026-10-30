/**
 * fixEndedNotice — telling the SC when their AI's fix of a kept clash ends (EDS-56,
 * owner 2026-10-30: "AI finished. Now what do I do as an end user?").
 *
 * A notification says what happened, naming the update as its row does; a finished one
 * offers the live storefront. When the Updates window that kept the clash is still showing
 * its run, the row flips to what happened, and the local copy line follows only when the
 * copy is clean. The notification is a side channel: what it returns never waits on it.
 */

import * as vscode from 'vscode';
import { openPrivateBrowser } from '@/core/utils/browserUtils';
import { forgetKeptRows, tellFixEnded, watchKeptRows } from '@/features/updates/handlers/fixEndedNotice';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

jest.mock('@/core/utils/browserUtils', () => ({ openPrivateBrowser: jest.fn().mockResolvedValue(true) }));

const showInfo = vscode.window.showInformationMessage as jest.Mock;
const openBrowser = openPrivateBrowser as jest.Mock;

/** JustRite: a storefront added from a colleague's repository, its live site on aem.live. */
function justrite(metadata: Record<string, unknown> = { githubRepo: 'skukla/justrite', templateOwner: 'kmanns', templateRepo: 'justrite' }): Project {
    return createMockProject({
        name: 'justrite',
        title: 'JustRite',
        path: '/p/justrite',
        selectedStack: 'eds-accs',
        componentInstances: {
            'eds-storefront': { id: 'eds-storefront', name: 'EDS Storefront', type: 'frontend', status: 'ready', metadata },
        },
    });
}

const ROW = { projectName: 'justrite', rowId: 'boilerplate:0', localCopyId: 'localCopy:/p/justrite' };

/** Let the notification's answer arrive. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
    jest.clearAllMocks();
    forgetKeptRows();
    showInfo.mockResolvedValue(undefined);
});

describe('tellFixEnded: the notification', () => {
    it('says a finished update is live, naming it as its row does, and offers the storefront', async () => {
        showInfo.mockResolvedValue('Open storefront');

        const line = tellFixEnded(justrite(), 'boilerplate', 'finished', true);

        expect(line).toBe("JustRite's Adobe boilerplate update is live.");
        expect(showInfo).toHaveBeenCalledWith("JustRite's Adobe boilerplate update is live.", 'Open storefront');
        await settle();
        expect(openBrowser).toHaveBeenCalledWith('https://main--justrite--skukla.aem.live');
    });

    it('names a colleague\'s template update by whose changes it carries', () => {
        expect(tellFixEnded(justrite(), 'template', 'finished', true)).toBe(
            "JustRite's update with changes from kmanns/justrite is live.",
        );
    });

    it('opens nothing when the SC dismisses it', async () => {
        tellFixEnded(justrite(), 'boilerplate', 'finished', true);
        await settle();

        expect(openBrowser).not.toHaveBeenCalled();
    });

    it('offers no storefront when the project has no live site to open', () => {
        tellFixEnded(justrite({}), 'boilerplate', 'finished', true);

        expect(showInfo).toHaveBeenCalledWith("JustRite's Adobe boilerplate update is live.");
    });

    it('says nothing changed and the update is still offered when the AI dropped the fix', () => {
        const line = tellFixEnded(justrite(), 'boilerplate', 'left');

        expect(line).toBe(
            "Your AI dropped its fix for JustRite's Adobe boilerplate update. Nothing changed, and the update is still offered in Check for Updates.",
        );
        expect(showInfo).toHaveBeenCalledWith(line);
    });

    it('says a newer version came out when the fix was dropped for it', () => {
        expect(tellFixEnded(justrite(), 'boilerplate', 'moved-on')).toBe(
            "Your AI's fix for JustRite's Adobe boilerplate update was dropped, because a newer version came out. "
                + 'Nothing changed. Check for updates to get the newer one.',
        );
    });

    it('answers without waiting for the SC to read it', () => {
        showInfo.mockReturnValue(new Promise(() => undefined));

        expect(tellFixEnded(justrite(), 'boilerplate', 'finished', true)).toBe("JustRite's Adobe boilerplate update is live.");
    });
});

describe('tellFixEnded: the Updates window still showing the run', () => {
    it('flips the row to updated by the AI, and the local copy to up to date when it is clean', () => {
        const tell = jest.fn();
        watchKeptRows([ROW], tell);

        tellFixEnded(justrite(), 'boilerplate', 'finished', true);

        expect(tell.mock.calls).toEqual([
            [{ id: 'boilerplate:0', state: 'done', message: 'Updated by your AI.' }],
            [{ id: 'localCopy:/p/justrite', state: 'done' }],
        ]);
    });

    it('leaves the local copy line alone when the copy is not clean', () => {
        const tell = jest.fn();
        watchKeptRows([ROW], tell);

        tellFixEnded(justrite(), 'boilerplate', 'finished', false);

        expect(tell.mock.calls).toEqual([[{ id: 'boilerplate:0', state: 'done', message: 'Updated by your AI.' }]]);
    });

    it('flips the row back to not updated, still offered, when the AI dropped the fix', () => {
        const tell = jest.fn();
        watchKeptRows([ROW], tell);

        tellFixEnded(justrite(), 'boilerplate', 'left');

        expect(tell.mock.calls).toEqual([
            [{ id: 'boilerplate:0', state: 'skipped', message: 'Not updated. Your AI dropped the fix, so nothing changed. It is still offered in Check for Updates.' }],
        ]);
    });

    it('tells a row once, and only the project it is for', () => {
        const tell = jest.fn();
        watchKeptRows([ROW, { projectName: 'bodea', rowId: 'template:0', localCopyId: 'localCopy:/p/bodea' }], tell);

        tellFixEnded(justrite(), 'boilerplate', 'finished', false);
        tellFixEnded(justrite(), 'boilerplate', 'finished', false);

        expect(tell).toHaveBeenCalledTimes(1);
        expect(tell).toHaveBeenCalledWith(expect.objectContaining({ id: 'boilerplate:0' }));
    });

    it('tells no row once the window moved on to another list or run', () => {
        const tell = jest.fn();
        watchKeptRows([ROW], tell);
        forgetKeptRows();

        tellFixEnded(justrite(), 'boilerplate', 'finished', true);

        expect(tell).not.toHaveBeenCalled();
        expect(showInfo).toHaveBeenCalledTimes(1);
    });
});
