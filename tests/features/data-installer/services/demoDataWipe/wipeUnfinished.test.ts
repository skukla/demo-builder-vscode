/**
 * The note a clearing leaves when a write failed and no read would find the thing again: it only
 * widens what the next clearing of the same stores looks at.
 */

import { readWipeClaims } from '@/features/data-installer/services/demoDataWipe/wipeClaims';
import { readWipeStructure } from '@/features/data-installer/services/demoDataWipe/wipeReads';
import { resolveWipeScope } from '@/features/data-installer/services/demoDataWipe/wipeScope';
import { readWipeUnfinished, rememberWipeUnfinished } from '@/features/data-installer/services/demoDataWipe/wipeUnfinished';
import { createMockProject } from '../../../../helpers/projectFake';
import { memoryFiles } from '../demoBuilderEngine/demoBuilderEngine.testUtils';
import { sandbox } from './wipe.testUtils';

const PATH = '/nonexistent/projects/zz';
const NOTE = { scopeKey: 'justrite_test_website/justrite_test_store', groups: [25], sets: [40], attributes: ['wiper_size'] };

describe('the unfinished note', () => {
    it('reads back what was written, beside the project and outside the datapacks folder', async () => {
        const files = memoryFiles();

        await rememberWipeUnfinished(files, PATH, NOTE);

        expect(await files.read(`${PATH}/.demo-builder/wipe-unfinished.json`)).toContain('wiper_size');
        expect(await readWipeUnfinished(files, PATH)).toEqual(NOTE);
    });

    it('goes away when a clearing finishes', async () => {
        const files = memoryFiles();
        await rememberWipeUnfinished(files, PATH, NOTE);

        await rememberWipeUnfinished(files, PATH, undefined);

        expect(await readWipeUnfinished(files, PATH)).toBeUndefined();
    });

    it('is ignored when it cannot be read', async () => {
        const files = memoryFiles({ [`${PATH}/.demo-builder/wipe-unfinished.json`]: 'not json' });

        expect(await readWipeUnfinished(files, PATH)).toBeUndefined();
    });

    it('counts only for the same stores', async () => {
        const files = memoryFiles();
        await rememberWipeUnfinished(files, PATH, NOTE);
        const structure = await readWipeStructure(sandbox().get);
        const project = createMockProject({ name: 'zz', path: PATH, componentConfigs: {} });

        const same = await readWipeClaims(files, project, [], structure, resolveWipeScope(structure, [{ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store' }]));
        const other = await readWipeClaims(files, project, [], structure, resolveWipeScope(structure, [{ websiteCode: 'bodea', storeCode: 'bodea_store' }]));

        expect(same).toMatchObject({ unfinished: NOTE });
        expect('unfinished' in other).toBe(false);
    });
});
