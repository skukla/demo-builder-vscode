/**
 * The agent's datapack tools match the Datapacks screen (datapack-simplification Phase 8).
 *
 * What is pinned, and why:
 *
 * - **No Data Installer destination (D7).** The screen hides writing into the Data Installer
 *   (`INSTALLER_WRITES_SHOWN`), since our accounts cannot write there and every try fails. The agent
 *   tools lose it outright: `copy_library_datapack_to_installer` is gone, and `add_datapack_from_file`
 *   writes into My Datapacks only. Its `target` is FORCED, not defaulted, so an agent whose session
 *   still holds the old schema cannot send `target: "installer"` and reach it. The argument the
 *   handler receives is asserted, because a mock cannot see a malformed call.
 * - **Delete removes a pack of saves whole**, as the screen's Delete does (`everyVersion`).
 * - **The screen's words.** "Demo Builder datapack", never "team pack", in what an agent reads and
 *   passes on; the `team` argument and the tool's name stay (identifiers, not words on screen).
 */

import { alertCopyFor } from '@/features/ai/server/agentAlertCopy';
import { DATA_INSTALLER_DESCRIPTORS } from '@/features/ai/server/dataInstallerDescriptors';
import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import { registerDescriptorTools, type ToolDescriptor } from '@/features/ai/server/toolDescriptors';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { fakeServer } from './toolDescriptors.testUtils';

const row = (tool: string): ToolDescriptor => {
    const found = DATA_INSTALLER_DESCRIPTORS.find((d) => d.tool === tool);
    if (!found) throw new Error(`no row ${tool}`);
    return found;
};
const keys = (tool: string) => Object.keys(row(tool).inputSchema ?? {}).sort();

/** Every word an agent reads about a datapack tool: its description and each input's. */
function textOf(d: ToolDescriptor): string {
    const fields = Object.values(d.inputSchema ?? {}).map((field) => field.description ?? '');
    return [d.description, ...fields].join('\n');
}

describe('D7: no Data Installer destination on the agent surface', () => {
    it('has no tool that copies a pack into the Data Installer', () => {
        expect(DATA_INSTALLER_DESCRIPTORS.map((d) => d.tool)).not.toContain(
            'copy_library_datapack_to_installer'
        );
        for (const d of DATA_INSTALLER_DESCRIPTORS) {
            expect(textOf(d)).not.toContain('copy_library_datapack_to_installer');
        }
    });

    // saveAs is the screen's Keep Both (step-07 F1).
    it('gives add_datapack_from_file no destination and no name echo, and forces My Datapacks', () => {
        expect(keys('add_datapack_from_file')).toEqual(['path', 'saveAs', 'update']);
        expect(row('add_datapack_from_file').argDefaults).toStrictEqual({ target: 'library' });
    });

    it("says add_datapack_from_file is the screen's Add from File, into My Datapacks", () => {
        const { description } = row('add_datapack_from_file');

        expect(description).toContain("the screen's Add from File");
        expect(description).toContain('My Datapacks');
        expect(description).not.toMatch(/confirmName/u);
    });

    describe('the call', () => {
        const handlers = importHandlers as unknown as Record<
            string,
            (c: HandlerContext, p?: unknown) => Promise<HandlerResponse>
        >;
        let reached: jest.SpyInstance;

        beforeEach(() => {
            reached = jest
                .spyOn(handlers, 'load-datapack-zip')
                .mockResolvedValue({ success: true });
        });
        afterEach(() => reached.mockRestore());

        it('hands the handler target library even when an old session sends installer', async () => {
            const server = fakeServer();
            registerDescriptorTools(server, [row('add_datapack_from_file')], () =>
                createMockHandlerContext()
            );
            const tool = server.tools.get('add_datapack_from_file');
            if (!tool) throw new Error('not registered');

            await tool.handler({
                path: 'packs/luma.datapack.zip',
                target: 'installer',
                confirmName: 'luma',
                confirm: true,
            });

            expect(reached).toHaveBeenCalledTimes(1);
            expect(reached.mock.calls[0][1]).toMatchObject({
                path: 'packs/luma.datapack.zip',
                target: 'library',
            });
        });
    });
});

describe("Delete, as the screen's Delete", () => {
    it('takes everyVersion, and a version only when deleting one', () => {
        const schema = row('delete_library_datapack').inputSchema ?? {};

        // keepSettingsLayer: the screen's one Delete after a load removes only what the load made (step-07 F2).
        expect(keys('delete_library_datapack')).toEqual([
            'datapackName',
            'everyVersion',
            'keepSettingsLayer',
            'version',
        ]);
        expect(schema.everyVersion.parse(true)).toBe(true);
        expect(schema.version.parse(undefined)).toBeUndefined();
    });

    it("says it is the screen's Delete, which takes every save of a pack of saves", () => {
        const { description } = row('delete_library_datapack');

        expect(description).toContain("the screen's Delete");
        expect(description).toContain('everyVersion');
        expect(description).not.toMatch(/the undo of\s+add_datapack_from_file/u);
    });

    // Step-07 A1: the screen offers no Delete on a Demo Builder datapack, and the tool says it refuses one.
    it('says a Demo Builder datapack is refused', () => {
        expect(row('delete_library_datapack').description).toContain('a Demo Builder datapack, as on the screen');
    });
});

describe("the screen's words", () => {
    const datapackReads = READ_DESCRIPTORS.filter((d) => d.tool.includes('datapack'));

    it('never calls a Demo Builder datapack a team pack', () => {
        for (const d of [...DATA_INSTALLER_DESCRIPTORS, ...datapackReads]) {
            expect({ tool: d.tool, team: /team (data)?packs?\b/iu.test(textOf(d)) }).toStrictEqual({
                tool: d.tool,
                team: false,
            });
        }
    });

    it("says what the Demo Builder datapack mark does in the screen's list names", () => {
        const text = textOf(row('mark_demo_builder_datapack'));

        expect(text).toContain('Demo Builder Datapacks');
        expect(text).toContain('Community Datapacks');
        expect(text).not.toContain('Include Community');
    });

    it('names Share and Stop Sharing, Save as File and Save on their tools', () => {
        expect(row('share_datapack').description).toContain("the screen's Share and Stop Sharing");
        expect(row('save_datapack_zip').description).toContain("the screen's Save as File");
        expect(row('save_store_changes_to_pack').description).toContain('Save As New');
    });
});

describe("the consent dialog says the screen's words", () => {
    it('asks nothing about a Data Installer copy, and adds a file to My Datapacks only', () => {
        expect(alertCopyFor('copy_library_datapack_to_installer')).toBeUndefined();
        // Replace and Keep Both are named too (step-07 F1 review): each changes what the call does.
        expect(alertCopyFor('add_datapack_from_file')).toMatchObject({ action: 'Add a datapack from a file', target: ['path', 'update', 'saveAs'] });
        expect(alertCopyFor('add_datapack_from_file')?.consequence).not.toContain('Data Installer');
    });

    it("says what Replace and Keep Both do, in the dialog's lines", () => {
        const describe = alertCopyFor('add_datapack_from_file')?.describe;

        expect(describe?.({ path: 'luma.zip', update: true })).toBe('Replaces the datapack of the same version in My Datapacks.');
        expect(describe?.({ path: 'luma.zip', saveAs: 'My Luma 2' })).toBe('Adds it as My Luma 2, leaving the one already in My Datapacks as it is.');
        expect(describe?.({ path: 'luma.zip' })).toBeUndefined();
    });

    it('says Delete takes every save when asked to', () => {
        expect(alertCopyFor('delete_library_datapack')?.consequence).toContain('every save');
    });

    it('calls the mark a Demo Builder datapack, in the screen\'s list names', () => {
        const copy = alertCopyFor('mark_demo_builder_datapack');

        expect(copy?.action).toBe('Mark a Demo Builder datapack');
        expect(copy?.consequence).toContain('Demo Builder Datapacks');
        expect(copy?.consequence).not.toContain('Include Community');
    });

    it('calls the export a save, as the screen does', () => {
        expect(alertCopyFor('create_datapack')?.action).toBe('Save to a datapack');
    });
});
