/**
 * The note a clearing leaves when a write failed and no read would find the thing again: it only
 * widens what the next clearing of the same websites looks at.
 */

import { readWipeClaims } from '@/features/data-installer/services/demoDataWipe/wipeClaims';
import { readWipeStructure } from '@/features/data-installer/services/demoDataWipe/wipeReads';
import { readWipeUnfinished, rememberWipeUnfinished } from '@/features/data-installer/services/demoDataWipe/wipeUnfinished';
import { createMockProject } from '../../../../helpers/projectFake';
import { memoryFiles } from '../demoBuilderEngine/demoBuilderEngine.testUtils';
import { sandbox } from './wipe.testUtils';

const PATH = '/nonexistent/projects/zz';
const NOTE = { scopeKey: 'justrite_test_website', groups: [25], sets: [40], attributes: ['wiper_size'] };

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

    it('counts only for the same websites', async () => {
        const files = memoryFiles();
        await rememberWipeUnfinished(files, PATH, NOTE);
        const structure = await readWipeStructure(sandbox().get);
        const project = createMockProject({ name: 'zz', path: PATH, componentConfigs: {} });

        const same = await readWipeClaims(files, project, [], structure, { kind: 'instance', websites: ['justrite_test_website'] });
        const other = await readWipeClaims(files, project, [], structure, { kind: 'instance', websites: ['bodea'] });

        expect(same.respects).toMatchObject({ unfinished: NOTE });
        expect('unfinished' in other.respects).toBe(false);
    });

    it('ignores a note left by a clearing of stores, before Clear took whole websites', async () => {
        const files = memoryFiles();
        await rememberWipeUnfinished(files, PATH, { ...NOTE, scopeKey: 'justrite_test_website/justrite_test_store' });
        const structure = await readWipeStructure(sandbox().get);
        const project = createMockProject({ name: 'zz', path: PATH, componentConfigs: {} });

        const claims = await readWipeClaims(files, project, [], structure, { kind: 'instance', websites: ['justrite_test_website'] });

        expect('unfinished' in claims.respects).toBe(false);
    });
});
