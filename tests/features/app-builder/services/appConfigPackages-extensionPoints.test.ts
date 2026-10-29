/**
 * appConfigPackages — the extension points an app declares (the root `extensions:` keys).
 * These are what `aio app deploy` publishes on the workspace in Adobe's registry, and a
 * removal reads them before the local folder goes so it can check the registry for them.
 */

import { mockRead } from './appConfigPackages.testUtils';
import * as yaml from 'yaml';
import { listDeclaredExtensionPoints } from '@/features/app-builder/services/appConfigPackages';

/** A standalone app.config.yaml with the given package map. */
function config(packages: Record<string, unknown>): string {
    return yaml.stringify({ application: { runtimeManifest: { packages } } });
}

beforeEach(() => jest.clearAllMocks());

describe('listDeclaredExtensionPoints', () => {
    it('answers the keys of the root extensions map — what the deploy publishes on the workspace', async () => {
        mockRead.mockResolvedValueOnce(
            yaml.stringify({
                extensions: {
                    'commerce/backend-ui/1': { $include: 'src/commerce-backend-ui-1/ext.config.yaml' },
                    'dx/excshell/1': { $include: 'src/dx-excshell-1/ext.config.yaml' },
                },
            }),
        );

        await expect(listDeclaredExtensionPoints('/c')).resolves.toStrictEqual([
            'commerce/backend-ui/1',
            'dx/excshell/1',
        ]);
    });

    it('answers nothing for a standalone app, which publishes no extension point', async () => {
        mockRead.mockResolvedValueOnce(config({ app: {} }));

        await expect(listDeclaredExtensionPoints('/c')).resolves.toStrictEqual([]);
    });

    it('answers nothing when the config cannot be read', async () => {
        mockRead.mockRejectedValueOnce(new Error('ENOENT'));

        await expect(listDeclaredExtensionPoints('/c')).resolves.toStrictEqual([]);
    });
});
