/**
 * Demo Builder's Node folder (PR-1a): where it lives and how a command is
 * pointed at it.
 */

import * as os from 'os';
import * as path from 'path';
import {
    nodeFolderPath,
    fnmExecCommand,
    nodeFolderEnv,
    nodeFolderProcessEnv,
    fnmTerminalCommand,
} from '@/core/shell/nodeFolder';

describe('nodeFolder', () => {
    it('lives in ~/.demo-builder/node, beside the projects', () => {
        expect(nodeFolderPath()).toBe(path.join(os.homedir(), '.demo-builder', 'node'));
        expect(nodeFolderEnv()).toStrictEqual({ FNM_DIR: nodeFolderPath() });
    });

    it('runs a command on a major through fnm', () => {
        expect(fnmExecCommand('/opt/homebrew/bin/fnm', '24', 'aio --version')).toBe(
            '/opt/homebrew/bin/fnm exec --using=24 aio --version',
        );
    });

    it("points a terminal command at Demo Builder's Node folder with a shell assignment", () => {
        expect(fnmTerminalCommand('24', 'npm run dev')).toBe(
            `FNM_DIR="${nodeFolderPath()}" fnm exec --using=24 npm run dev`,
        );
    });

    it("gives a bare fnm call Demo Builder's Node folder while keeping the rest of the environment", () => {
        const env = nodeFolderProcessEnv();
        expect(env.FNM_DIR).toBe(nodeFolderPath());
        // An env without PATH runs nothing.
        expect(env.PATH).toBe(process.env.PATH);
    });
});
