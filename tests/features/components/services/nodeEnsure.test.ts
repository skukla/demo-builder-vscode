/**
 * nodeEnsure: the Adobe CLI's install commands come from the prerequisites manager,
 * read exactly as the prerequisites screen reads them (one definition of "install
 * the Adobe CLI"), here through a REAL manager over the real config on disk.
 */

import * as path from 'path';
import { adobeCliInstallCommands, ensureNode, prerequisitesOf } from '@/features/components/services/nodeEnsure';
import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';
import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

function realPrerequisites() {
    const logger = createMockLogger();
    return new PrerequisitesManager(REPO_ROOT, logger, createMockCommandExecutor(), new PrerequisitesCacheManager(logger));
}

describe('adobeCliInstallCommands', () => {
    it('is the aio-cli install, then its plugins, as the prerequisites declare them', async () => {
        expect(await adobeCliInstallCommands(realPrerequisites(), '24')).toStrictEqual([
            'npm install -g @adobe/aio-cli --no-fund --verbose',
            'aio plugins:install @adobe/aio-cli-plugin-api-mesh',
        ]);
    });

    it('refuses a config with no aio-cli entry', async () => {
        const prereqs = {
            getPrerequisiteById: jest.fn().mockResolvedValue(undefined),
            getInstallSteps: jest.fn(),
            getPluginInstallCommands: jest.fn(),
        };
        await expect(adobeCliInstallCommands(prereqs, '24')).rejects.toThrow('no aio-cli entry');
    });
});

describe('ensureNode', () => {
    it('installs only the Node when the caller needs no Adobe CLI', async () => {
        const executor = createMockCommandExecutor({
            execute: jest.fn().mockResolvedValue({ code: 0, stdout: 'v24.21.0', stderr: '', duration: 1 }),
        });
        const prereqs = { getPrerequisiteById: jest.fn(), getInstallSteps: jest.fn(), getPluginInstallCommands: jest.fn() };

        await ensureNode(executor, prereqs, { major: '24', adobeCli: false }, createMockLogger());

        expect(prereqs.getPrerequisiteById).not.toHaveBeenCalled();
    });
});

describe('prerequisitesOf', () => {
    it('answers the handler context\'s manager, and refuses a context without one', () => {
        const manager = realPrerequisites();
        expect(prerequisitesOf({ prereqManager: manager })).toBe(manager);
        expect(() => prerequisitesOf({})).toThrow('no prerequisites manager');
    });
});
