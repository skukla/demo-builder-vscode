/**
 * Fix with AI on an import that ended with a problem (owner, 2026-11-07): the prompt names the pack,
 * the project and each problem from the RECORDED job, never from the window, and the handler opens
 * the SC's AI on it through the Chat command the Updates window uses.
 */

import * as vscode from 'vscode';
import {
    fixImportPrompt,
    importFixWithAiHandlers,
} from '@/features/data-installer/handlers/importFixHandlers';
import { JOB_KEY } from '@/features/data-installer/handlers/importJobWatch';
import type { ImportJobRecord } from '@/features/data-installer/types';
import {
    createMockExtensionContext,
    createStatefulGlobalState,
} from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const RECORD: ImportJobRecord = {
    activationId: 'demo-builder-1',
    datapackName: 'luma',
    version: 'eds-compatible',
    commerceInstance: 'inst',
    dataTypes: ['categories', 'products'],
    startedAt: '2026-11-07T18:00:00.000Z',
    outcome: 'success',
    perType: { categories: 'success', products: 'success' },
};

describe('fixImportPrompt', () => {
    it('names the pack, the project, each row’s problem, and the tools that fix it', () => {
        const prompt = fixImportPrompt(
            { ...RECORD, rowNotes: { products: 'Commerce refused 3 rows.' } },
            'Justrite Demo'
        );

        expect(prompt).toContain('luma@eds-compatible');
        expect(prompt).toContain('Justrite Demo');
        expect(prompt).toContain('- Products: Commerce refused 3 rows.');
        for (const tool of [
            'get_datapack_import_status',
            'verify_datapack_install',
            'write_commerce_rest',
            'start_datapack_import',
        ]) {
            expect(prompt).toContain(tool);
        }
    });

    it('says where it stopped and why', () => {
        const prompt = fixImportPrompt(
            {
                ...RECORD,
                outcome: 'partial',
                stoppedAt: 'products',
                reason: 'Commerce answered 403',
            },
            'Justrite Demo'
        );

        expect(prompt).toContain('- It stopped at Products: Commerce answered 403');
    });

    it('says the import stopped after every data type was in, never naming a data type', () => {
        const prompt = fixImportPrompt(
            { ...RECORD, outcome: 'partial', stoppedAt: 'finishing', reason: 'Commerce answered 503' },
            'Justrite Demo'
        );

        expect(prompt).toContain('- It stopped after every data type was in, while finishing the install: Commerce answered 503');
        expect(prompt).not.toContain('It stopped at');
    });

    it('CONTROL: has nothing to say about an import with no problem', () => {
        expect(fixImportPrompt(RECORD, 'Justrite Demo')).toBeUndefined();
    });
});

describe('fix-datapack-import-with-ai', () => {
    function contextWith(record: ImportJobRecord | null) {
        const { globalState } = createStatefulGlobalState();
        void globalState.update(JOB_KEY, record);
        return createMockHandlerContext({
            logger: createMockLogger(),
            context: createMockExtensionContext({ globalState }),
            stateManager: createMockStateManager({
                getCurrentProject: jest.fn().mockResolvedValue({ name: 'Justrite Demo' }),
            }),
        });
    }

    beforeEach(() => jest.mocked(vscode.commands.executeCommand).mockClear());

    it('opens the SC’s AI in a new chat on the recorded problem', async () => {
        const result = await importFixWithAiHandlers['fix-datapack-import-with-ai'](
            contextWith({ ...RECORD, rowNotes: { products: 'Commerce refused 3 rows.' } })
        );

        expect(result).toEqual({ success: true });
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'demoBuilder.openInClaude',
            expect.objectContaining({
                fresh: true,
                prompt: expect.stringContaining('Commerce refused 3 rows.'),
            })
        );
    });

    it('CONTROL: opens nothing, and says why, when the last import has no problem', async () => {
        const result = await importFixWithAiHandlers['fix-datapack-import-with-ai'](
            contextWith(RECORD)
        );

        expect(result).toEqual({ success: false, error: 'The last install has no problem to fix.' });
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });
});
