/**
 * The elicitation REQUEST itself — what `askChatForConsent` hands the SDK.
 *
 * `consentViaChat.test.ts` drives the same code over a real socket, which proves
 * the round trip and says nothing about the request's shape: a client that gets
 * an empty schema, or no timeout, still answers. Those are the arguments the
 * collaborator receives, so they are asserted here against the SDK handle
 * directly.
 *
 * The two-minute timeout is asserted as a NUMBER rather than through the
 * exported constant. Reading the constant back would agree with itself whatever
 * it held.
 */

import { ElicitResultSchema } from '@modelcontextprotocol/sdk/types.js';
import {
    askChatForConsent,
    CHAT_CONSENT_TIMEOUT_MS,
    type ElicitCapableExtra,
} from '@/features/ai/server/consentViaChat';
import { buildConsentPrompt } from '@/features/ai/server/consentText';

/** A tool with authored consent copy that names its target from the args. */
const TOOL = 'start_datapack_import';
const ARGS = { datapackName: 'citisignal', version: '1.2.0' };

/** The per-call handle, with `sendRequest` answering `action`. */
function extraAnswering(action: string): {
    extra: ElicitCapableExtra;
    sendRequest: jest.Mock;
} {
    const sendRequest = jest.fn().mockResolvedValue({ action });
    return { extra: { sendRequest }, sendRequest };
}

describe('askChatForConsent', () => {
    it('asks with the authored prompt, the allow schema and a two-minute timeout', async () => {
        const { extra, sendRequest } = extraAnswering('accept');
        const prompt = buildConsentPrompt(TOOL, ARGS);

        const verdict = await askChatForConsent(TOOL, ARGS, extra, true);

        expect(verdict).toBe('accept');
        expect(sendRequest).toHaveBeenCalledWith(
            {
                method: 'elicitation/create',
                params: {
                    message: `${prompt?.title}\n\n${prompt?.detail}`,
                    requestedSchema: {
                        type: 'object',
                        properties: {
                            allow: {
                                type: 'boolean',
                                description: 'Allow this operation?',
                            },
                        },
                        required: ['allow'],
                    },
                },
            },
            ElicitResultSchema,
            { timeout: 120_000 }
        );
    });

    it('exports that timeout as two minutes', () => {
        expect(CHAT_CONSENT_TIMEOUT_MS).toBe(120_000);
    });

    it.each(['decline', 'cancel', 'something-else'])('treats %s as a refusal', async (action) => {
        const { extra } = extraAnswering(action);

        await expect(askChatForConsent(TOOL, ARGS, extra, true)).resolves.toBe('refuse');
    });

    it('is unavailable when the client declared no elicitation capability', async () => {
        const { extra, sendRequest } = extraAnswering('accept');

        await expect(askChatForConsent(TOOL, ARGS, extra, false)).resolves.toBe('unavailable');
        expect(sendRequest).not.toHaveBeenCalled();
    });

    it('is unavailable when the call carries no SDK handle at all', async () => {
        // Not a refusal, and not a throw either: the modal is the floor, and a
        // gate that crashed here would take the tool call down with it.
        await expect(askChatForConsent(TOOL, ARGS, undefined, true)).resolves.toBe('unavailable');
    });

    it('is unavailable when the ask itself fails', async () => {
        const sendRequest = jest.fn().mockRejectedValue(new Error('transport closed'));

        await expect(askChatForConsent(TOOL, ARGS, { sendRequest }, true)).resolves.toBe(
            'unavailable'
        );
    });
});
