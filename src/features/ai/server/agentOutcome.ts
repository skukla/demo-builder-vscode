/**
 * What an agent's tool call ended as, read from the answer it RETURNED.
 *
 * The notifier used to judge by throw alone: a throw was a failure, anything
 * else was "done". But a tool that needs the user answers normally — a
 * `needsAuth` or `needsUser` hand-back (`handoff.ts`) — and a failed call answers
 * normally too, marked `isError` (`mcpToolResult.ts`). On 2026-09-19 a republish
 * that stopped for a GitHub sign-in flashed "— done" in the status bar and
 * changed nothing; only the agent was told why.
 *
 * vscode-free, so the reading is testable without the window.
 *
 * @module features/ai/server/agentOutcome
 */

import type { McpTextResult } from './mcpToolResult';

/** How the window reports a returned call. */
export type AgentOutcome =
    | { kind: 'done' }
    /** `text` is the step, in the user's words: "Sign in to GitHub". */
    | { kind: 'needsUser'; text: string }
    | { kind: 'failed'; text: string };

/** `needsAuth` values, as a person writes the service. */
const SERVICE_NAMES: Record<string, string> = {
    github: 'GitHub',
    adobe: 'Adobe',
    dalive: 'DA.live',
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/** The envelope's text, parsed when it is JSON; the text itself when it is prose. */
function bodyOf(result: unknown): unknown {
    const content = isRecord(result) ? (result as Partial<McpTextResult>).content : undefined;
    const text = Array.isArray(content) ? content[0]?.text : undefined;
    if (typeof text !== 'string') {
        return undefined;
    }
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/** The step a hand-back asks of the user, or undefined when it is not one. */
function handBackStep(body: Record<string, unknown>): string | undefined {
    const handoff = body.needsUser;
    if (isRecord(handoff) && typeof handoff.what === 'string') {
        return handoff.what;
    }
    if (typeof body.needsAuth === 'string') {
        return `Sign in to ${SERVICE_NAMES[body.needsAuth] ?? body.needsAuth}`;
    }
    return undefined;
}

function failureText(body: unknown): string {
    if (isRecord(body) && typeof body.error === 'string') {
        return body.error;
    }
    return typeof body === 'string' ? body : 'the tool reported a failure';
}

/**
 * Read a returned tool answer.
 *
 * @param result - what the tool handler returned (normally an MCP text envelope)
 * @returns done, waiting on the user, or failed
 */
export function outcomeOf(result: unknown): AgentOutcome {
    const body = bodyOf(result);
    const step = isRecord(body) ? handBackStep(body) : undefined;
    if (step) {
        return { kind: 'needsUser', text: step };
    }
    if (isRecord(result) && result.isError === true) {
        return { kind: 'failed', text: failureText(body) };
    }
    return { kind: 'done' };
}
