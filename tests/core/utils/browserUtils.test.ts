/**
 * openInIncognito — the URL reaches Chrome as an ARGUMENT, never inside a shell
 * string. Admin URLs are typed by users, and `$(…)` inside a quoted shell string
 * runs as a command.
 */

const mockExecFile = jest.fn();
jest.mock('child_process', () => ({
    execFile: (...args: unknown[]) => mockExecFile(...args),
}));

const mockOpenExternal = jest.fn().mockResolvedValue(true);
jest.mock('vscode', () => ({
    env: { openExternal: (...args: unknown[]) => mockOpenExternal(...args) },
    Uri: { parse: (value: string) => ({ value }) },
}), { virtual: true });

import { openInIncognito } from '@/core/utils/browserUtils';

const realPlatform = process.platform;
function onPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', { value: platform });
}

afterEach(() => {
    onPlatform(realPlatform);
    jest.clearAllMocks();
});

describe('openInIncognito', () => {
    it('passes the URL to `open` as one argument, with no shell', async () => {
        onPlatform('darwin');
        mockExecFile.mockImplementation((_file, _args, callback) => callback(null, '', ''));
        const url = 'https://admin.example/$(touch /tmp/pwned)?a="b"';

        const opened = await openInIncognito(url);

        expect(opened).toBe(true);
        expect(mockExecFile).toHaveBeenCalledWith(
            'open',
            ['-na', 'Google Chrome', '--args', '--incognito', url],
            expect.any(Function),
        );
        expect(mockOpenExternal).not.toHaveBeenCalled();
    });

    it('falls back to the default browser when Chrome cannot be opened', async () => {
        onPlatform('darwin');
        mockExecFile.mockImplementation((_file, _args, callback) => callback(new Error('no Chrome')));

        const opened = await openInIncognito('https://admin.example/');

        expect(opened).toBe(false);
        expect(mockOpenExternal).toHaveBeenCalledWith({ value: 'https://admin.example/' });
    });

    it('uses the default browser off macOS', async () => {
        onPlatform('linux');

        const opened = await openInIncognito('https://admin.example/');

        expect(opened).toBe(false);
        expect(mockExecFile).not.toHaveBeenCalled();
        expect(mockOpenExternal).toHaveBeenCalledTimes(1);
    });
});
