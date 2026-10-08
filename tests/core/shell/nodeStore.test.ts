/**
 * Demo Builder's own Node store (PR-1a): where it lives and how a command is
 * pointed at it.
 */

import * as os from 'os';
import * as path from 'path';
import {
    demoBuilderFnmDir,
    fnmExecCommand,
    fnmStoreEnv,
    fnmStoreProcessEnv,
    fnmTerminalCommand,
} from '@/core/shell/nodeStore';

describe('nodeStore', () => {
    it('lives in ~/.demo-builder/node, beside the projects', () => {
        expect(demoBuilderFnmDir()).toBe(path.join(os.homedir(), '.demo-builder', 'node'));
        expect(fnmStoreEnv()).toStrictEqual({ FNM_DIR: demoBuilderFnmDir() });
    });

    it('runs a command on a major through fnm', () => {
        expect(fnmExecCommand('/opt/homebrew/bin/fnm', '24', 'aio --version')).toBe(
            '/opt/homebrew/bin/fnm exec --using=24 aio --version',
        );
    });

    it('points a terminal command at the store with a shell assignment', () => {
        expect(fnmTerminalCommand('24', 'npm run dev')).toBe(
            `FNM_DIR="${demoBuilderFnmDir()}" fnm exec --using=24 npm run dev`,
        );
    });

    it("gives a bare fnm call the store while keeping the rest of the environment", () => {
        const env = fnmStoreProcessEnv();
        expect(env.FNM_DIR).toBe(demoBuilderFnmDir());
        // An env without PATH runs nothing.
        expect(env.PATH).toBe(process.env.PATH);
    });
});
