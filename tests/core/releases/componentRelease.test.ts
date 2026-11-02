/**
 * What a component's newest release is, for this user. What matters is what it ASKS GitHub on
 * whose behalf, so the arguments are asserted.
 */

import * as vscode from 'vscode';
import {
    configureReleaseAccess,
    readComponentRelease,
    refOfSource,
} from '@/core/releases/componentRelease';

const LIST = [{ tag_name: 'v1.1.0' }, { tag_name: 'v1.2.0-beta.1' }, { tag_name: 'v2.0.0-alpha.1' }];

function onChannel(channel: string) {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get: jest.fn(() => channel) });
}

function answers(body: unknown, init: { ok?: boolean; status?: number } = {}) {
    global.fetch = jest.fn().mockResolvedValue({
        ok: init.ok ?? true,
        status: init.status ?? 200,
        json: async () => body,
    });
}

const fetched = () => (global.fetch as jest.Mock).mock.calls[0];

beforeEach(() => {
    jest.clearAllMocks();
    configureReleaseAccess(undefined);
    onChannel('stable');
});
afterAll(() => configureReleaseAccess(undefined));

describe('readComponentRelease', () => {
    it('answers the tag, and the version without its v', async () => {
        answers({ tag_name: 'v1.2.0' });

        expect(await readComponentRelease('skukla/demo-erp')).toStrictEqual({ tag: 'v1.2.0', version: '1.2.0' });
    });

    it('answers null when there is no release', async () => {
        answers({}, { ok: false, status: 404 });

        expect(await readComponentRelease('skukla/demo-erp')).toBeNull();
    });

    it('sends the token it was given', async () => {
        configureReleaseAccess({
            earlyAccessAllowed: async () => false,
            headers: async () => ({ Authorization: 'token a-token' }),
        });
        answers({ tag_name: 'v1.2.0' });

        await readComponentRelease('skukla/demo-erp');

        expect(fetched()[1].headers).toStrictEqual({ Authorization: 'token a-token' });
    });

    it('asks anonymously until it has been given access', async () => {
        answers({ tag_name: 'v1.2.0' });

        await readComponentRelease('skukla/demo-erp');

        expect(fetched()[1]).not.toHaveProperty('headers');
    });

    it('early access reaches a collaborator, as the highest of every track', async () => {
        onChannel('early-access');
        configureReleaseAccess({ earlyAccessAllowed: async () => true, headers: async () => ({}) });
        answers(LIST);

        expect((await readComponentRelease('skukla/demo-erp'))?.tag).toBe('v2.0.0-alpha.1');
    });

    it('early access is beta for anyone else', async () => {
        onChannel('early-access');
        configureReleaseAccess({ earlyAccessAllowed: async () => false, headers: async () => ({}) });
        answers(LIST);

        expect((await readComponentRelease('skukla/demo-erp'))?.tag).toBe('v1.2.0-beta.1');
    });

    it('early access stays closed until it has been opened', async () => {
        onChannel('early-access');
        answers(LIST);

        expect((await readComponentRelease('skukla/demo-erp'))?.tag).toBe('v1.2.0-beta.1');
    });

    it('a failed token read answers null, never throwing', async () => {
        configureReleaseAccess({
            earlyAccessAllowed: async () => false,
            headers: async () => {
                throw new Error('no storage');
            },
        });

        expect(await readComponentRelease('skukla/demo-erp')).toBeNull();
    });
});

describe('refOfSource', () => {
    const OWNED = { owner: 'skukla', repo: 'demo-builder-block-library', branch: 'main' };

    it('an owned repository reads at its newest release', async () => {
        answers({ tag_name: 'v0.2.0' });

        expect(await refOfSource(OWNED)).toStrictEqual({ ref: 'v0.2.0', version: '0.2.0' });
    });

    it('an owned repository with no release yet reads its branch', async () => {
        answers({}, { ok: false, status: 404 });

        expect(await refOfSource(OWNED)).toStrictEqual({ ref: 'main' });
    });

    it("someone else's repository reads its branch, and is not looked up", async () => {
        global.fetch = jest.fn();

        const ref = await refOfSource({ owner: 'demo-system-stores', repo: 'accs-citisignal', branch: 'main' });

        expect(ref).toStrictEqual({ ref: 'main' });
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
