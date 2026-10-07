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
    getAdobeCliNodeVersion,
    setAdobeCliNodeVersion,
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

    it("holds the Adobe CLI's Node once activation sets it", () => {
        setAdobeCliNodeVersion('24');
        expect(getAdobeCliNodeVersion()).toBe('24');
    });
});
