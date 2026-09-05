/**
 * The Chrome-less pre-check inside the AI setup verifier.
 *
 * `@playwright/mcp` drives the machine's installed Google Chrome, and falls back
 * to the ~150 MB Chromium its `install-browser` subcommand caches. With neither,
 * the three scraping skills fail MID-SCRAPE with no warning — so this check exists
 * to make the absence visible up front, and nothing here downloads anything.
 *
 * Everything it decides is platform-shaped: WHERE Chrome lives and WHERE the
 * browser cache lives both differ per platform, so the whole check was reachable
 * by nothing on a single-platform test run. `process.platform` is stubbed per
 * case and `os.homedir` is mocked, so the assertions are on the PATHS PROBED
 * rather than on whatever this machine happens to have installed.
 */

import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

jest.mock('fs/promises', () => ({
    realpath: jest.fn(async (p: string) => p),
    readFile: jest.fn(),
    access: jest.fn(),
    readdir: jest.fn(),
}));

// A homedir no probe can accidentally succeed against: every fs call here is
// mocked, and a real home leaking in would make a cache hit depend on the
// machine running the suite.
jest.mock('os', () => ({
    ...jest.requireActual('os'),
    homedir: jest.fn(() => '/nonexistent-home'),
}));

jest.mock('@/features/ai/skillInspector', () => ({
    inspectSkills: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/features/ai/mcpInspector', () => ({
    inspectAllServers: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/features/ai/sessionMcpDetector', () => ({
    detectSessionMcps: jest.fn().mockResolvedValue([]),
}));

import { verifyAiSetup } from '@/features/ai/aiSetupVerifier';
import type { AiCheckResult } from '@/features/ai/aiSetupVerifier';

const PROJECT_PATH = '/projects/test-project';
const EXT_DIST_PATH = '/ext/dist';
const HOME = '/home/tester';

/** Where the check looks for the package that makes it applicable at all. */
const PW_PACKAGE = path.join(PROJECT_PATH, '.demo-builder-mcp', 'node_modules', '@playwright', 'mcp');

const MAC_CHROME = '/Applications/Google Chrome.app';
const LINUX_CHROME = '/usr/bin/google-chrome';
const LINUX_CHROME_STABLE = '/usr/bin/google-chrome-stable';

interface Arrangement {
    platform: NodeJS.Platform;
    /** Paths `access` resolves for. Everything else rejects. */
    present?: string[];
    /** What a readdir of the browser cache answers, or the error it throws. */
    cache?: string[] | Error;
    env?: Record<string, string | undefined>;
}

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const savedEnv: Record<string, string | undefined> = {};

function arrange({ platform, present = [], cache = [], env = {} }: Arrangement): void {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    for (const [key, value] of Object.entries(env)) {
        savedEnv[key] = process.env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }

    const presentSet = new Set(present);
    (fsPromises.access as jest.Mock).mockImplementation(async (p: string) => {
        if (presentSet.has(String(p))) return undefined;
        throw new Error(`ENOENT: ${String(p)}`);
    });
    (fsPromises.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));
    (fsPromises.readdir as jest.Mock).mockImplementation(async (dir: string) => {
        if (String(dir).endsWith('skills')) return [];
        if (cache instanceof Error) throw cache;
        return cache;
    });
}

async function browserCheck(): Promise<AiCheckResult | undefined> {
    const result = await verifyAiSetup(PROJECT_PATH, EXT_DIST_PATH);
    return result.checks.find((c) => c.name === 'playwright-browser');
}

/** Every path handed to `access`, in call order. */
function probed(): string[] {
    return (fsPromises.access as jest.Mock).mock.calls.map((c) => String(c[0]));
}

/** Every directory handed to `readdir`, in call order. */
function listed(): string[] {
    return (fsPromises.readdir as jest.Mock).mock.calls.map((c) => String(c[0]));
}

describe('playwright-browser check', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (os.homedir as jest.Mock).mockReturnValue(HOME);
    });

    afterEach(() => {
        Object.defineProperty(process, 'platform', originalPlatform);
        for (const [key, value] of Object.entries(savedEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });

    describe('applicability', () => {
        it('stays out of the checks list entirely when Playwright is not installed', async () => {
            // Absent means "not applicable or opted out" — the scraping skills are
            // gated on the same package, so there is nothing to warn about.
            arrange({ platform: 'darwin', present: [MAC_CHROME] });

            expect(await browserCheck()).toBeUndefined();
        });

        it('runs once the package is present in the project tools dir', async () => {
            arrange({ platform: 'darwin', present: [PW_PACKAGE, MAC_CHROME] });

            expect(await browserCheck()).toEqual({ name: 'playwright-browser', status: 'ok' });
        });
    });

    describe('where it looks for Chrome, per platform', () => {
        it('probes the macOS application bundle on darwin', async () => {
            arrange({ platform: 'darwin', present: [PW_PACKAGE, MAC_CHROME] });

            const check = await browserCheck();

            expect(probed()).toContain(MAC_CHROME);
            expect(check?.status).toBe('ok');
        });

        it('probes PROGRAMFILES on win32', async () => {
            const programFiles = 'D:\\Programs';
            arrange({
                platform: 'win32',
                present: [PW_PACKAGE],
                env: { PROGRAMFILES: programFiles },
            });

            await browserCheck();

            expect(probed()).toContain(
                path.join(programFiles, 'Google/Chrome/Application/chrome.exe'),
            );
            expect(probed()).not.toContain(MAC_CHROME);
        });

        it('falls back to the default Program Files when PROGRAMFILES is unset', async () => {
            arrange({ platform: 'win32', present: [PW_PACKAGE], env: { PROGRAMFILES: undefined } });

            await browserCheck();

            expect(probed()).toContain(
                path.join('C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
            );
        });

        it('probes both Linux binary names elsewhere', async () => {
            arrange({ platform: 'linux', present: [PW_PACKAGE, LINUX_CHROME_STABLE] });

            const check = await browserCheck();

            expect(probed()).toContain(LINUX_CHROME);
            expect(probed()).toContain(LINUX_CHROME_STABLE);
            expect(probed()).not.toContain(MAC_CHROME);
            expect(check?.status).toBe('ok');
        });
    });

    describe('the cached-Chromium fallback', () => {
        it('reads the macOS cache directory when Chrome is absent', async () => {
            arrange({
                platform: 'darwin',
                present: [PW_PACKAGE],
                cache: ['firefox-1489', 'chromium-1148'],
            });

            const check = await browserCheck();

            expect(listed()).toContain(path.join(HOME, 'Library', 'Caches', 'ms-playwright'));
            expect(check).toEqual({ name: 'playwright-browser', status: 'ok' });
        });

        it('reads LOCALAPPDATA on win32', async () => {
            const localAppData = 'D:\\Users\\t\\AppData\\Local';
            arrange({
                platform: 'win32',
                present: [PW_PACKAGE],
                cache: ['chromium-1148'],
                env: { LOCALAPPDATA: localAppData },
            });

            const check = await browserCheck();

            expect(listed()).toContain(path.join(localAppData, 'ms-playwright'));
            expect(check?.status).toBe('ok');
        });

        it('reads ~/.cache elsewhere', async () => {
            arrange({ platform: 'linux', present: [PW_PACKAGE], cache: ['chromium-1148'] });

            const check = await browserCheck();

            expect(listed()).toContain(path.join(HOME, '.cache', 'ms-playwright'));
            expect(check?.status).toBe('ok');
        });

        it('accepts only a chromium entry, not any browser in the cache', async () => {
            arrange({ platform: 'darwin', present: [PW_PACKAGE], cache: ['firefox-1489'] });

            const check = await browserCheck();

            expect(check?.status).toBe('warning');
        });
    });

    describe('when the machine can drive nothing', () => {
        it('warns, and names both ways out', async () => {
            arrange({ platform: 'darwin', present: [PW_PACKAGE], cache: [] });

            const check = await browserCheck();

            expect(check?.name).toBe('playwright-browser');
            expect(check?.status).toBe('warning');
            expect(check?.message).toMatch(/Google Chrome/);
            expect(check?.message).toMatch(/playwright install chromium/);
        });

        it('warns rather than throwing when the cache directory does not exist', async () => {
            arrange({
                platform: 'darwin',
                present: [PW_PACKAGE],
                cache: new Error('ENOENT: no ms-playwright cache'),
            });

            expect((await browserCheck())?.status).toBe('warning');
        });

        it('does not report a browser found when every probe fails', async () => {
            // The whole point of the check: a machine with no Chrome and no cache
            // must say so, not report ok off the first path it happened to try.
            arrange({ platform: 'linux', present: [PW_PACKAGE], cache: [] });

            expect((await browserCheck())?.status).toBe('warning');
        });
    });
});
