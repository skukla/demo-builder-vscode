/**
 * Ask for consent in the CHAT, where the producer is actually looking.
 *
 * The modal opens in the VS Code window. The producer is watching the terminal
 * Claude session the extension launched. A blocking prompt in a window nobody is
 * watching is worse than no prompt — the agent hangs until it is noticed.
 *
 * MCP's elicitation lets a SERVER ask the USER something. Measured 2026-08-25:
 * Claude Code declares `elicitation: { form: {} }` and genuinely answers the
 * request. Record: `.rptc/research/consent-in-the-chat/`.
 *
 * ## The decision rule, and why it is this blunt
 *
 * **Anything that is not an explicit `accept` is a refusal.**
 *
 * A server cannot tell "nobody was there to ask" from "the user said no" — both
 * arrive as `cancel`, and the payload carries nothing that separates them. The
 * spec defines three actions, but only `cancel` has ever been observed here, so
 * branching on the difference would be a guess dressed as a fact. Both ways of
 * being wrong are bad: route `cancel` to the modal and someone who declined in
 * chat gets asked again elsewhere; do it headlessly and the call waits on a
 * dialog nobody is watching.
 *
 * ## What is NOT a refusal
 *
 * A client that cannot be asked at all — no elicitation capability, or the
 * request failed — is `unavailable`, not a no. That falls back to the modal,
 * which stays the floor. A consent gate that silently stops working is the worst
 * available outcome.
 *
 * This module is vscode-free by construction: it speaks MCP, and the fallback it
 * defers to is injected.
 *
 * @module features/ai/server/consentViaChat
 */

import { ElicitResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { buildConsentPrompt } from './consentText';

/**
 * Longest a chat prompt may go unanswered before the call gives up.
 *
 * Long enough for a person to read three lines and decide, short enough that a
 * forgotten prompt does not pin an agent indefinitely.
 *
 * **A timeout is `unavailable`, not a refusal** — it falls back to the modal.
 * That is deliberate and worth stating, because an earlier draft of this comment
 * claimed it "fails closed" while the code fell back, which is exactly the kind
 * of comment that becomes a lie nobody notices.
 *
 * The invariant that actually holds, and the only one that matters, is: **no
 * call is ever allowed without an explicit `accept` from somewhere.** The modal
 * cannot auto-allow either, so falling back to it never weakens the gate — it
 * moves the question to a surface the producer may still answer.
 */
export const CHAT_CONSENT_TIMEOUT_MS = 2 * 60 * 1000;

/** What the chat said, or that it could not be asked. */
export type ChatConsent = 'accept' | 'refuse' | 'unavailable';

/** The half of the SDK's per-call `extra` this needs. */
export interface ElicitCapableExtra {
    sendRequest: (
        request: { method: string; params: unknown },
        resultSchema: typeof ElicitResultSchema,
        options?: { timeout?: number },
    ) => Promise<{ action: string }>;
}

/**
 * Ask the chat whether this call may proceed.
 *
 * @param toolName - the tool asking
 * @param args - the call's arguments; only authored target keys are shown
 * @param extra - the SDK's per-call handle, which correlates the ask to this call
 * @param clientSupportsElicitation - whether the client declared the capability
 * @returns the verdict, or `unavailable` when the chat cannot be asked
 */
export async function askChatForConsent(
    toolName: string,
    args: unknown,
    extra: ElicitCapableExtra | undefined,
    clientSupportsElicitation: boolean,
): Promise<ChatConsent> {
    if (!clientSupportsElicitation || !extra?.sendRequest) return 'unavailable';

    const prompt = buildConsentPrompt(toolName, args);
    if (!prompt) return 'unavailable';

    try {
        const result = await extra.sendRequest(
            {
                method: 'elicitation/create',
                params: {
                    // ONE string: a chat prompt has no title/detail split like a
                    // modal, so the three authored lines are joined rather than
                    // reshaped. Reshaping them here would be a second voice.
                    message: `${prompt.title}\n\n${prompt.detail}`,
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
            { timeout: CHAT_CONSENT_TIMEOUT_MS },
        );
        return result.action === 'accept' ? 'accept' : 'refuse';
    } catch {
        // Could not ask — a client that declared the capability but errored, or
        // a transport that dropped. NOT a refusal: fall back to the modal, which
        // is the floor. A timeout also lands here, and the modal then asks a
        // question the producer can still answer.
        return 'unavailable';
    }
}
