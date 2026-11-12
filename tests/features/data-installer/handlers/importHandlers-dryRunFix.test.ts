/**
 * Step 03, S5: the dry run records its answer (datapack, version, reason), so Fix with AI on "Dry
 * Run Found a Problem" is built from what the extension saw, and an agent calling
 * validate_datapack_import reads the same reason the button's prompt names.
 */

import * as vscode from 'vscode';
import {
    happyEngine,
    importHandlers,
    makeImportHarness,
    stubEngine,
    PAYLOAD,
    setupSettings,
} from './importHandlers.testUtils';
import {
    DRY_RUN_KEY,
    type DryRunRecord,
} from '@/features/data-installer/handlers/importFixHandlers';

const REASON = 'Products: 3 rows would be refused: the attribute set Top does not exist.';

function refusingEngine(): void {
    stubEngine({
        checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
        validateImport: jest.fn().mockResolvedValue({ valid: false, reason: REASON }),
        startImport: jest.fn(),
    });
}

describe('validate-datapack-import records its answer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupSettings();
    });

    it('records the datapack, its version and the reason it found', async () => {
        refusingEngine();
        const { context, stores } = makeImportHarness();

        await importHandlers['validate-datapack-import'](context, PAYLOAD);

        const expected: DryRunRecord = {
            datapackName: 'bodea',
            version: 'main',
            valid: false,
            reason: REASON,
        };
        expect(stores.globalState.update).toHaveBeenCalledWith(DRY_RUN_KEY, expected);
    });

    it('records a pass too, so a later dry run replaces an earlier problem', async () => {
        refusingEngine();
        const { context, peek } = makeImportHarnessWithPeek();
        await importHandlers['validate-datapack-import'](context, PAYLOAD);

        happyEngine();
        await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(peek(DRY_RUN_KEY)).toEqual({ datapackName: 'bodea', version: 'main', valid: true });
    });

    it('clears the record when the check could not run', async () => {
        refusingEngine();
        const { context, peek } = makeImportHarnessWithPeek();
        await importHandlers['validate-datapack-import'](context, PAYLOAD);

        stubEngine({
            checkCredentials: jest.fn().mockRejectedValue(new Error('socket hang up')),
            validateImport: jest.fn(),
            startImport: jest.fn(),
        });
        await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(peek(DRY_RUN_KEY)).toBeNull();
    });

    // The agent surface: the tool's refusal and the button's prompt name the same reason.
    it('answers the agent with the reason the Fix with AI prompt names', async () => {
        refusingEngine();
        const { context } = makeImportHarness();

        const answer = await importHandlers['validate-datapack-import'](context, PAYLOAD);
        await importHandlers['fix-datapack-import-with-ai'](context, { from: 'dry-run' });

        expect(answer.data).toEqual({ valid: false, reason: REASON });
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'demoBuilder.openInClaude',
            expect.objectContaining({ prompt: expect.stringContaining(`- ${REASON}`) })
        );
    });
});

function makeImportHarnessWithPeek() {
    const { context, stores } = makeImportHarness();
    return { context, peek: (key: string) => stores.globalState.get(key) };
}
