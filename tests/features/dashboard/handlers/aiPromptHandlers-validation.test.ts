/**
 * aiPromptHandlers — payload validation
 *
 * `isValidPromptPayload` is module-private, so it is driven through
 * `handleSaveAiPrompt`, which is the only caller. Each case here makes exactly
 * ONE conjunct of the validator decide the outcome: every other field is valid,
 * so a test that still rejects proves that conjunct is what rejected it.
 *
 * Both halves of every case are asserted — the rejection response AND that
 * neither store was written — because a validator that wrongly ACCEPTS is the
 * failure that matters: it persists a prompt the UI cannot render.
 */

// The mock preamble lives in aiHandlers.testUtils, so it must be required BEFORE
// the module under test — hence this import first. The subjects then come from the
// module that DECLARES them, which is also what pairs this suite to that module in
// the mutation configs (tests/sop/mutation-config-pairing.test.ts).
import { createAiHandlerContext } from './aiHandlers.testUtils';
import { handleSaveAiPrompt } from '@/features/dashboard/handlers/aiPromptHandlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockExtensionContext, createStatefulGlobalState } from '../../../helpers/extensionContextFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { ErrorCode } from '@/types/errorCodes';
import type { AiPrompt } from '@/types/base';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

const INVALID = {
    success: false,
    error: 'Invalid prompt payload',
    code: ErrorCode.CONFIG_INVALID,
};

/** A context whose two stores both record every write attempt. */
function makeValidationContext(): {
    context: HandlerContext;
    saveProject: jest.Mock;
    globalState: ReturnType<typeof createStatefulGlobalState>['globalState'];
} {
    const saveProject = jest.fn().mockResolvedValue(undefined);
    const { globalState } = createStatefulGlobalState();
    const context = createAiHandlerContext({
        context: createMockExtensionContext(
            { globalState, secrets: createMockSecretStorage().secrets },
            '/mock/extension/path'
        ),
        stateManager: createMockStateManager({
            getCurrentProject: jest
                .fn()
                .mockResolvedValue({ name: 'p', path: '/projects/p', aiPrompts: [] }),
            saveProject,
        }),
    });
    return { context, saveProject, globalState };
}

/**
 * Drive the handler with a deliberately malformed prompt and report both the
 * response and whether EITHER store was written.
 *
 * The cast is the point of the test: these are shapes the compiler would reject
 * and the webview channel can still deliver, since a message payload is JSON
 * that nothing on the wire typechecks.
 */
async function save(prompt: unknown): Promise<{ result: HandlerResponse; wrote: boolean }> {
    const { context, saveProject, globalState } = makeValidationContext();

    const result = await handleSaveAiPrompt(context, { prompt: prompt as AiPrompt });

    return {
        result,
        wrote: saveProject.mock.calls.length > 0 || globalState.update.mock.calls.length > 0,
    };
}

describe('aiPromptHandlers — prompt payload validation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects a null prompt without dereferencing it', async () => {
        const { result, wrote } = await save(null);

        expect(result).toEqual(INVALID);
        expect(wrote).toBe(false);
    });

    it('rejects a non-object prompt even when it carries every required field', async () => {
        // The only JS value that is not an object yet can carry `id`/`title`/
        // `prompt` is a function. Nothing else distinguishes the object guard
        // from the field guards below, so this is what pins it.
        const notAnObject = Object.assign(() => undefined, {
            id: 'fn',
            title: 'Looks valid',
            prompt: 'Looks valid',
        });
        const { result, wrote } = await save(notAnObject);

        expect(result).toEqual(INVALID);
        expect(wrote).toBe(false);
    });

    it('rejects an id that is not a string', async () => {
        const { result, wrote } = await save({ id: 123, title: 'T', prompt: 'B' });

        expect(result).toEqual(INVALID);
        expect(wrote).toBe(false);
    });

    it('rejects a non-string id that nonetheless has a length', async () => {
        // `typeof p.id === 'string'` is the only conjunct that rejects this:
        // an array id is truthy and `['a'].length > 0` passes the next check.
        // Accepting it would persist a prompt whose id never matches any of the
        // by-id lookups the save, delete and merge paths all run.
        const { result, wrote } = await save({ id: ['a'], title: 'T', prompt: 'B' });

        expect(result).toEqual(INVALID);
        expect(wrote).toBe(false);
    });

    it('rejects an empty id', async () => {
        const { result, wrote } = await save({ id: '', title: 'T', prompt: 'B' });

        expect(result).toEqual(INVALID);
        expect(wrote).toBe(false);
    });

    it('rejects a title that is not a string', async () => {
        const { result, wrote } = await save({ id: 'a', title: 5, prompt: 'B' });

        expect(result).toEqual(INVALID);
        expect(wrote).toBe(false);
    });

    it('rejects a whitespace-only title', async () => {
        // Not merely an empty title: `.trim()` is what makes '   ' invalid, and
        // dropping it would let a blank-looking prompt into the list.
        const { result, wrote } = await save({ id: 'a', title: '   ', prompt: 'B' });

        expect(result).toEqual(INVALID);
        expect(wrote).toBe(false);
    });

    it('rejects a prompt body that is not a string', async () => {
        const { result, wrote } = await save({ id: 'a', title: 'T', prompt: 7 });

        expect(result).toEqual(INVALID);
        expect(wrote).toBe(false);
    });

    it('rejects a whitespace-only prompt body', async () => {
        const { result, wrote } = await save({ id: 'a', title: 'T', prompt: '  \n  ' });

        expect(result).toEqual(INVALID);
        expect(wrote).toBe(false);
    });

    it('accepts a prompt whose title and body have surrounding whitespace, storing them verbatim', async () => {
        // The counterpart to the two cases above: `.trim()` decides validity, it
        // does not rewrite what is stored.
        const { context, saveProject } = makeValidationContext();

        const result = await handleSaveAiPrompt(context, {
            prompt: { id: 'a', title: '  T  ', prompt: '  B  ' },
        });

        expect(result.success).toBe(true);
        expect(saveProject.mock.calls[0][0].aiPrompts).toEqual([
            { id: 'a', title: '  T  ', prompt: '  B  ' },
        ]);
    });
});
