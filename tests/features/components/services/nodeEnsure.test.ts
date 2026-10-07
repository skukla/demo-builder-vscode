/**
 * nodeEnsure: the Adobe CLI's install commands come from the prerequisites' own
 * entry (one definition of "install the Adobe CLI"), read from the REAL config.
 */

import { adobeCliInstallCommands } from '@/features/components/services/nodeEnsure';

describe('adobeCliInstallCommands', () => {
    it('is the aio-cli install, then its plugins', () => {
        expect(adobeCliInstallCommands()).toStrictEqual([
            'npm install -g @adobe/aio-cli --no-fund --verbose',
            'aio plugins:install @adobe/aio-cli-plugin-api-mesh',
        ]);
    });
});
