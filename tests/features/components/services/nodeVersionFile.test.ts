/**
 * nodeVersionFile — against a real directory, because the decisions ARE file states:
 * absent, byte-identical, hand-edited, tracked by the component's repo, a symlink.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    isTrackedByRepo,
    refreshNodeVersionFile,
    writeNodeVersionFileIfAbsent,
} from '@/features/components/services/nodeVersionFile';
import { createMockLogger } from '../../../helpers/loggerFake';

const notTracked = jest.fn(async () => false);

let dir: string;
const file = () => path.join(dir, '.node-version');
const read = () => fs.readFileSync(file(), 'utf-8');

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-version-'));
    notTracked.mockClear();
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('writeNodeVersionFileIfAbsent — fresh installs', () => {
    it('writes the major with a trailing newline when the folder has none', async () => {
        await expect(writeNodeVersionFileIfAbsent(dir, '24')).resolves.toBe('written');
        expect(read()).toBe('24\n');
    });

    it('never overwrites a file already there (the repo may ship its own)', async () => {
        fs.writeFileSync(file(), '18\n');

        await expect(writeNodeVersionFileIfAbsent(dir, '24')).resolves.toBe('present');
        expect(read()).toBe('18\n');
    });

    it('does not write through a symlink at the target', async () => {
        const elsewhere = path.join(dir, 'elsewhere');
        fs.symlinkSync(elsewhere, file());

        await expect(writeNodeVersionFileIfAbsent(dir, '24')).resolves.toBe('present');
        expect(fs.existsSync(elsewhere)).toBe(false);
    });
});

describe('refreshNodeVersionFile — existing projects', () => {
    const mesh = { componentPath: '', componentId: 'eds-commerce-mesh', major: '24' };
    const run = (args = mesh, logger = createMockLogger()) =>
        refreshNodeVersionFile({ ...args, componentPath: dir }, logger, notTracked);

    it('rewrites exactly what an earlier install wrote for that component', async () => {
        fs.writeFileSync(file(), '20\n');

        await expect(run()).resolves.toBe('rewritten');
        expect(read()).toBe('24\n');
    });

    it('rewrites the ingestion tool from its own earlier version, 18', async () => {
        fs.writeFileSync(file(), '18\n');

        await expect(run({ ...mesh, componentId: 'commerce-demo-ingestion' })).resolves.toBe('rewritten');
        expect(read()).toBe('24\n');
    });

    it.each([
        ['a different version', '22\n'],
        ['a version with a note', '20 # mine\n'],
        ['an extra line', '20\nlts\n'],
        ['the old version without its newline', '20'],
    ])('leaves %s alone and reports it', async (_label, content) => {
        fs.writeFileSync(file(), content);
        const logger = createMockLogger();

        await expect(run(mesh, logger)).resolves.toBe('skipped');
        expect(read()).toBe(content);
        // The skip is an event, not silence: one info line. Its wording is not the contract.
        expect(logger.info).toHaveBeenCalledTimes(1);
    });

    it("leaves another component's old version alone (18 was never written for a mesh)", async () => {
        fs.writeFileSync(file(), '18\n');

        await expect(run()).resolves.toBe('skipped');
        expect(read()).toBe('18\n');
    });

    it('leaves a file the component repository tracks alone, even when the bytes match', async () => {
        fs.writeFileSync(file(), '20\n');

        const result = await refreshNodeVersionFile({ ...mesh, componentPath: dir }, createMockLogger(), async () => true);

        expect(result).toBe('skipped');
        expect(read()).toBe('20\n');
    });

    it('does not create a file that is not there', async () => {
        await expect(run()).resolves.toBe('absent');
        expect(fs.existsSync(file())).toBe(false);
    });

    it('does nothing to a file already at the catalog version', async () => {
        fs.writeFileSync(file(), '24\n');
        const before = fs.statSync(file()).mtimeMs;

        await expect(run()).resolves.toBe('unchanged');
        expect(read()).toBe('24\n');
        expect(fs.statSync(file()).mtimeMs).toBe(before);
        expect(notTracked).not.toHaveBeenCalled();
    });
});

describe('isTrackedByRepo — the real git answer', () => {
    function gitInit(): void {
        const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
        git('init', '-q');
        git('config', 'user.email', 'test@example.com');
        git('config', 'user.name', 'Test');
    }

    it('is true for a committed file and false for an untracked one', async () => {
        gitInit();
        fs.writeFileSync(file(), '20\n');
        execFileSync('git', ['-C', dir, 'add', '.node-version'], { stdio: 'ignore' });

        await expect(isTrackedByRepo(dir, '.node-version')).resolves.toBe(true);
        await expect(isTrackedByRepo(dir, 'other-file')).resolves.toBe(false);
    });

    it('is false outside any repository', async () => {
        fs.writeFileSync(file(), '20\n');

        await expect(isTrackedByRepo(dir, '.node-version')).resolves.toBe(false);
    });
});
