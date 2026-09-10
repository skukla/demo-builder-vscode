/**
 * AutoUpdater — what the background check DECIDES.
 *
 * Every assertion here is about the request that went out or the UpdateInfo that
 * came back: which endpoint, which asset, which version comparison. The channel
 * -alpha safety rules live in autoUpdater.test.ts; this file covers the rest of
 * the path, including the 4-hour timer that nothing observed before.
 */

jest.mock('axios');
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        QUICK: 5000,
        AUTO_UPDATE_CHECK_INTERVAL: 14400000,
        AUTH: { BROWSER: 120000 },
    },
}));

import axios from 'axios';
import * as vscode from 'vscode';
import { AutoUpdater } from '@/utils/autoUpdater';
import { contextAtVersion, makeAsset, makeLogger, makeRelease } from './autoUpdater.testUtils';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const CHECK_INTERVAL_MS = 14_400_000;

/** Point the configuration at `channel`; the returned fn records how it was read. */
function setChannel(channel: string): jest.Mock {
    const get = jest.fn((_key: string, def?: unknown) => channel ?? def);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get });
    return get;
}

describe('AutoUpdater — background check', () => {
    let updater: AutoUpdater | undefined;

    beforeEach(() => {
        jest.clearAllMocks();
        setChannel('stable');
    });

    afterEach(() => {
        updater?.dispose();
        updater = undefined;
    });

    function build(version = '1.0.0'): AutoUpdater {
        updater = new AutoUpdater(contextAtVersion(version), makeLogger());
        return updater;
    }

    describe('where it looks', () => {
        it('reads updateChannel out of the demoBuilder configuration, defaulting to stable', async () => {
            const get = setChannel('stable');
            mockedAxios.get.mockResolvedValue({ data: makeRelease({ tag_name: 'v1.1.0' }) });

            await build().checkForUpdates();

            expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('demoBuilder');
            expect(get).toHaveBeenCalledWith('updateChannel', 'stable');
        });

        it('asks the GitHub v3 API for the release list with the quick timeout', async () => {
            setChannel('beta');
            mockedAxios.get.mockResolvedValue({ data: [makeRelease({ tag_name: 'v1.1.0' })] });

            await build().checkForUpdates();

            expect(mockedAxios.get).toHaveBeenCalledWith(
                'https://api.github.com/repos/skukla/demo-builder-vscode/releases?per_page=20',
                {
                    headers: { Accept: 'application/vnd.github.v3+json' },
                    timeout: 5000,
                },
            );
        });

        it('asks for /releases/latest on the stable channel', async () => {
            setChannel('stable');
            mockedAxios.get.mockResolvedValue({ data: makeRelease({ tag_name: 'v1.1.0' }) });

            await build().checkForUpdates();

            expect(mockedAxios.get).toHaveBeenCalledWith(
                'https://api.github.com/repos/skukla/demo-builder-vscode/releases/latest',
                expect.any(Object),
            );
        });

        it('never reaches the network in a development host', async () => {
            const previous = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';
            try {
                const result = await build().checkForUpdates();

                expect(result).toBeUndefined();
                expect(mockedAxios.get).not.toHaveBeenCalled();
            } finally {
                process.env.NODE_ENV = previous;
            }
        });

        it('takes the stable payload as-is instead of filtering it by track', async () => {
            // /releases/latest answers ONE release, so the track filter is deliberately
            // skipped on this channel. Handed a list, this reads tag_name off the array
            // itself and offers nothing, rather than picking a member of it.
            setChannel('stable');
            mockedAxios.get.mockResolvedValue({ data: [makeRelease({ tag_name: 'v2.0.0' })] });

            expect(await build('1.0.0').checkForUpdates()).toBeUndefined();
        });

        it('uses a single-object payload as the release when the channel is not stable', async () => {
            // GitHub answers /releases with an array, but a proxy or a cached error page
            // can hand back one object; the track filter is only for arrays.
            setChannel('beta');
            mockedAxios.get.mockResolvedValue({ data: makeRelease({ tag_name: 'v1.4.0' }) });

            const result = await build().checkForUpdates();

            expect(result?.version).toBe('1.4.0');
        });
    });

    describe('what counts as an update', () => {
        it('offers nothing when the newest release is the installed version', async () => {
            mockedAxios.get.mockResolvedValue({ data: makeRelease({ tag_name: 'v1.0.0' }) });

            expect(await build('1.0.0').checkForUpdates()).toBeUndefined();
        });

        it('offers nothing when the newest release is older than the installed version', async () => {
            mockedAxios.get.mockResolvedValue({ data: makeRelease({ tag_name: 'v0.9.0' }) });

            expect(await build('1.0.0').checkForUpdates()).toBeUndefined();
        });

        it('reports every field of the update, with the tag’s leading v stripped', async () => {
            mockedAxios.get.mockResolvedValue({
                data: makeRelease({
                    tag_name: 'v2.3.4',
                    body: 'Routine fixes',
                    published_at: '2026-05-05T12:00:00Z',
                    assets: [
                        makeAsset({
                            name: 'extension.vsix',
                            browser_download_url: 'https://example.invalid/d/extension.vsix',
                        }),
                    ],
                }),
            });

            const result = await build('1.0.0').checkForUpdates();

            expect(result).toEqual({
                version: '2.3.4',
                critical: false,
                downloadUrl: 'https://example.invalid/d/extension.vsix',
                changelogUrl: 'https://example.invalid/releases/v2.3.4',
                releaseDate: '2026-05-05T12:00:00Z',
                minSupportedVersion: '1.0.0',
            });
        });
    });

    describe('choosing the artifact', () => {
        it('picks the .vsix asset rather than the first one listed', async () => {
            mockedAxios.get.mockResolvedValue({
                data: makeRelease({
                    tag_name: 'v1.1.0',
                    assets: [
                        makeAsset({
                            name: 'CHANGELOG.md',
                            browser_download_url: 'https://example.invalid/d/CHANGELOG.md',
                        }),
                        makeAsset({
                            name: 'demo-builder.vsix',
                            browser_download_url: 'https://example.invalid/d/demo-builder.vsix',
                        }),
                    ],
                }),
            });

            const result = await build('1.0.0').checkForUpdates();

            expect(result?.downloadUrl).toBe('https://example.invalid/d/demo-builder.vsix');
        });

        it('offers nothing when a newer release ships no .vsix', async () => {
            mockedAxios.get.mockResolvedValue({
                data: makeRelease({
                    tag_name: 'v1.1.0',
                    assets: [makeAsset({ name: 'notes.txt' })],
                }),
            });

            expect(await build('1.0.0').checkForUpdates()).toBeUndefined();
        });
    });

    describe('criticality', () => {
        it('marks the update critical when the release body says so', async () => {
            mockedAxios.get.mockResolvedValue({
                data: makeRelease({ tag_name: 'v1.1.0', body: 'Fixes [CRITICAL] data loss' }),
            });

            expect((await build('1.0.0').checkForUpdates())?.critical).toBe(true);
        });

        it('is not critical when the release has no body at all', async () => {
            mockedAxios.get.mockResolvedValue({
                data: makeRelease({
                    tag_name: 'v1.1.0',
                    body: undefined as unknown as string,
                }),
            });

            expect((await build('1.0.0').checkForUpdates())?.critical).toBe(false);
        });
    });

    describe('when GitHub does not answer', () => {
        it('offers nothing when the request fails outright', async () => {
            mockedAxios.get.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

            expect(await build('1.0.0').checkForUpdates()).toBeUndefined();
        });

        it('offers nothing when the repository answers 404', async () => {
            mockedAxios.get.mockRejectedValue({ response: { status: 404 } });

            expect(await build('1.0.0').checkForUpdates()).toBeUndefined();
        });

        it('answers rather than throws when the failure carries no response object', async () => {
            // An axios-shaped error whose `response` never arrived: reading .status off it
            // unguarded would throw from INSIDE the catch, so the background check would
            // reject instead of quietly reporting no update.
            mockedAxios.get.mockRejectedValue({ response: undefined });

            await expect(build('1.0.0').checkForUpdates()).resolves.toBeUndefined();
        });
    });

    describe('the four-hour timer', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('checks nothing until the interval elapses, then checks once', async () => {
            mockedAxios.get.mockResolvedValue({ data: makeRelease({ tag_name: 'v1.1.0' }) });
            build('1.0.0');

            jest.advanceTimersByTime(CHECK_INTERVAL_MS - 1);
            expect(mockedAxios.get).not.toHaveBeenCalled();

            jest.advanceTimersByTime(1);
            await Promise.resolve();
            expect(mockedAxios.get).toHaveBeenCalledTimes(1);
        });

        it('stops checking once disposed', async () => {
            mockedAxios.get.mockResolvedValue({ data: makeRelease({ tag_name: 'v1.1.0' }) });
            const instance = build('1.0.0');

            instance.dispose();
            jest.advanceTimersByTime(CHECK_INTERVAL_MS * 3);
            await Promise.resolve();

            expect(mockedAxios.get).not.toHaveBeenCalled();
        });
    });
});
