/**
 * EnvironmentSetup — what the filesystem scans actually decide
 *
 * The existing path-discovery suite proves the happy answers. These pin the
 * decisions underneath them: which directory is read at all, which version
 * directory wins, what a version name without a leading "v" resolves to, and the
 * exact set of paths handed back — an exact set, because a scan that returns a
 * superset is indistinguishable from a correct one under a `toContain`.
 */
import { execSync } from 'child_process';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import { majorsWithAio } from '@/core/shell/aioNodeVersion';
import { EnvironmentSetup } from '@/core/shell/environmentSetup';
import { createEnvironmentSetup, resetAllMocks } from './environmentSetup.testUtils';

jest.mock('fs');
jest.mock('os', () => ({
    homedir: jest.fn(() => '/mock/home'),
    platform: jest.fn(() => process.platform),
}));
jest.mock('child_process', () => ({
    execSync: jest.fn(),
}));

const HOME = '/mock/home';
const FNM_BASE = path.join(HOME, '.local/share/fnm/node-versions');
const NVM_BASE = path.join(HOME, '.nvm/versions/node');

const mockedExists = fsSync.existsSync as jest.Mock;
const mockedReaddir = fsSync.readdirSync as jest.Mock;
const mockedExecSync = execSync as jest.Mock;

/** Only the listed paths exist. */
function onlyTheseExist(...paths: string[]): void {
    const set = new Set(paths);
    mockedExists.mockImplementation((p: string) => set.has(p));
}

/** The fnm layout the scanner reads in every case below. */
const scanFnm = (): string[] => majorsWithAio({ basePath: FNM_BASE, binSubpath: 'installation/bin/aio' });

/** Reach the private path collector directly, for the same reason. */
function collect(setup: EnvironmentSetup, base: string, templates: string[]): string[] {
    return (
        setup as unknown as {
            findNodeManagerPaths(b: string, t: string[]): string[];
        }
    ).findNodeManagerPaths(base, templates);
}

describe('EnvironmentSetup — discovery decisions', () => {
    let environmentSetup: EnvironmentSetup;

    let fnmDir: string | undefined;

    beforeEach(() => {
        resetAllMocks();
        // FNM_DIR moves the fnm base out from under FNM_BASE when it is set on the
        // machine running the suite; its own behaviour is covered by the nodeVersion
        // suite, and here it would only make the paths unpredictable.
        fnmDir = process.env.FNM_DIR;
        delete process.env.FNM_DIR;
        (os.homedir as jest.Mock).mockReturnValue(HOME);
        environmentSetup = createEnvironmentSetup(HOME);
    });

    afterEach(() => {
        if (fnmDir === undefined) delete process.env.FNM_DIR;
        else process.env.FNM_DIR = fnmDir;
    });

    describe('scanning a version manager for aio', () => {
        it('does not read a directory that is not there', () => {
            onlyTheseExist();

            expect(scanFnm()).toStrictEqual([]);
            expect(mockedReaddir).not.toHaveBeenCalled();
        });

        it('lists only the versions that actually hold aio', () => {
            mockedReaddir.mockReturnValue(['v18.0.0', 'v20.11.0']);
            onlyTheseExist(FNM_BASE, path.join(FNM_BASE, 'v20.11.0', 'installation/bin/aio'));

            expect(scanFnm()).toEqual(['20']);
        });

        it('lists majors newest first, whatever order the directory gives', () => {
            mockedReaddir.mockReturnValue(['v18.20.8', 'v24.22.1', 'v20.19.6']);
            onlyTheseExist(
                FNM_BASE,
                ...['v18.20.8', 'v24.22.1', 'v20.19.6'].map((v) => path.join(FNM_BASE, v, 'installation/bin/aio')),
            );

            expect(scanFnm()).toEqual(['24', '20', '18']);
        });

        it('lists a major once when two patch versions of it have aio', () => {
            mockedReaddir.mockReturnValue(['v24.12.0', 'v24.22.1']);
            onlyTheseExist(
                FNM_BASE,
                path.join(FNM_BASE, 'v24.12.0', 'installation/bin/aio'),
                path.join(FNM_BASE, 'v24.22.1', 'installation/bin/aio'),
            );

            expect(scanFnm()).toEqual(['24']);
        });

        it('reads the major version out of a directory named without a leading v', () => {
            mockedReaddir.mockReturnValue(['20.11.0']);
            onlyTheseExist(FNM_BASE, path.join(FNM_BASE, '20.11.0', 'installation/bin/aio'));

            expect(scanFnm()).toEqual(['20']);
        });

        // A name with no number is not a version `fnm exec --using` can take.
        it('skips a directory whose name carries no number', () => {
            mockedReaddir.mockReturnValue(['system']);
            onlyTheseExist(FNM_BASE, path.join(FNM_BASE, 'system', 'installation/bin/aio'));

            expect(scanFnm()).toStrictEqual([]);
        });

        it('answers an empty list when reading the directory throws', () => {
            onlyTheseExist(FNM_BASE);
            mockedReaddir.mockImplementation(() => {
                throw new Error('EACCES');
            });

            expect(scanFnm()).toStrictEqual([]);
        });
    });

    describe('collecting a version manager’s bin directories', () => {
        it('does not read a directory that is not there, and finds nothing', () => {
            onlyTheseExist();

            expect(collect(environmentSetup, FNM_BASE, ['bin'])).toStrictEqual([]);
            expect(mockedReaddir).not.toHaveBeenCalled();
        });

        it('returns only the template paths that exist, in template order', () => {
            mockedReaddir.mockReturnValue(['v20.11.0']);
            const present = path.join(FNM_BASE, 'v20.11.0', 'installation/bin');
            onlyTheseExist(FNM_BASE, present);

            expect(
                collect(environmentSetup, FNM_BASE, [
                    'installation/bin',
                    'installation/lib/node_modules/.bin',
                ]),
            ).toEqual([present]);
        });
    });

    describe('finding fnm on PATH', () => {
        beforeEach(() => {
            onlyTheseExist();
        });

        it('asks `which` on a POSIX host, with piped stdio and stderr discarded', () => {
            // Deliberately somewhere the common-locations loop does not look, so the
            // PATH fallback is what answers.
            mockedExecSync.mockReturnValue('/opt/tools/fnm\n');
            onlyTheseExist('/opt/tools/fnm');

            environmentSetup.findFnmPath();

            expect(mockedExecSync).toHaveBeenCalledWith('which fnm', {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
            });
        });

        it('asks `where` on Windows', () => {
            const platform = Object.getOwnPropertyDescriptor(process, 'platform');
            Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
            try {
                mockedExecSync.mockReturnValue('C:\\fnm\\fnm.exe\n');
                onlyTheseExist('C:\\fnm\\fnm.exe');

                environmentSetup.findFnmPath();

                expect(mockedExecSync).toHaveBeenCalledWith('where fnm', expect.any(Object));
            } finally {
                if (platform) Object.defineProperty(process, 'platform', platform);
            }
        });

        it('trims the output before taking its first line', () => {
            // `which` output can arrive with a leading blank line. Splitting first would
            // make line one the empty string, and the fallback would answer null.
            mockedExecSync.mockReturnValue('\n  /opt/tools/fnm\n/opt/other/fnm\n');
            onlyTheseExist('/opt/tools/fnm');

            expect(environmentSetup.findFnmPath()).toBe('/opt/tools/fnm');
        });

        it('refuses a path `which` named that is not actually there', () => {
            mockedExecSync.mockReturnValue('/opt/tools/fnm\n');
            onlyTheseExist();

            expect(environmentSetup.findFnmPath()).toBeNull();
        });

        it('looks once and remembers the answer', () => {
            mockedExecSync.mockReturnValue('/opt/tools/fnm\n');
            onlyTheseExist('/opt/tools/fnm');

            expect(environmentSetup.findFnmPath()).toBe('/opt/tools/fnm');
            mockedExecSync.mockClear();
            expect(environmentSetup.findFnmPath()).toBe('/opt/tools/fnm');

            expect(mockedExecSync).not.toHaveBeenCalled();
        });
    });

    describe('collecting npm global bin directories', () => {
        it('returns exactly the locations that exist and nothing else', () => {
            mockedReaddir.mockReturnValue([]);
            const npmGlobal = path.join(HOME, '.npm-global', 'bin');
            onlyTheseExist(npmGlobal, '/opt/homebrew/bin');

            expect(environmentSetup.findNpmGlobalPaths()).toEqual([
                npmGlobal,
                '/opt/homebrew/bin',
            ]);
        });

        it('returns an empty list when nothing is installed anywhere', () => {
            mockedReaddir.mockReturnValue([]);
            onlyTheseExist();

            expect(environmentSetup.findNpmGlobalPaths()).toStrictEqual([]);
        });

        it('includes both fnm and nvm bin directories it finds', () => {
            const fnmBin = path.join(FNM_BASE, 'v20.11.0', 'installation/bin');
            const nvmBin = path.join(NVM_BASE, 'v18.0.0', 'bin');
            mockedReaddir.mockImplementation((dir: string) =>
                dir === FNM_BASE ? ['v20.11.0'] : ['v18.0.0'],
            );
            onlyTheseExist(FNM_BASE, fnmBin, NVM_BASE, nvmBin);

            expect(environmentSetup.findNpmGlobalPaths()).toEqual([fnmBin, nvmBin]);
        });
    });
});
