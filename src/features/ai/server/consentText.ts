/**
 * The words a consent prompt says — shared by every surface that asks.
 *
 * Lifted out of `agentOperationNotifier.ts` when the chat became a second place
 * consent can appear. Two surfaces asking the same question in two different
 * ways is how they drift, and the one that drifts is whichever nobody is
 * watching — so the text is built ONCE here and rendered by each surface in its
 * own frame.
 *
 * This module is deliberately **vscode-free**: the chat path lives inside the
 * MCP server, which must stay importable without vscode.
 *
 * @module features/ai/server/consentText
 */

import { alertCopyFor } from './agentAlertCopy';

/** Longest arg value the consent dialog will print before eliding. */
const CONSENT_DETAIL_VALUE_MAX = 60;

/**
 * Friendlier labels for argument keys a producer would not recognise.
 *
 * `confirmName` used to be here. It is the surface's proof-of-intent echo — the
 * agent repeats the target's name to show it means this one — and it was
 * rendered because the dialog printed every scalar it was handed. Now that only
 * authored target keys are shown, and no tool names `confirmName` as its target
 * (the tools that require it already name the same thing properly, e.g.
 * `start_datapack_export` shows the pack rather than the echo), the entry was
 * unreachable and is gone rather than left as a stub.
 */
const CONSENT_KEY_LABELS: Record<string, string> = {
    projectName: 'Project',
};

/** `blockId` / `block_id` → "Block id". A label, not an identifier. */
function humanizeKey(key: string): string {
    const labelled = CONSENT_KEY_LABELS[key];
    if (labelled) return labelled;
    const spaced = key
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Arg keys whose VALUES must never reach a dialog (or anywhere else). */
const SECRET_KEY_RE = /token|secret|password|credential|apikey|api_key/i;

/**
 * Render a call's args for the consent dialog — the informed half of
 * informed consent. Scalars only (an object arg is structure, not a decision
 * input), the `confirm` marker itself skipped, secret-shaped keys masked,
 * long values elided. This deliberately DOES show values where the logging
 * wrapper shows only keys: "publish /products/x" is the substance the user
 * is consenting to.
 */
export function renderTargetForConsent(args: unknown, keys: string[]): string {
    if (!args || typeof args !== 'object') return '';
    const record = args as Record<string, unknown>;
    const lines: string[] = [];
    // AUTHORED order, not schema order. The previous version walked
    // Object.entries and printed everything, so deleting an Adobe project led
    // with a 19-digit id and buried the name.
    for (const key of keys) {
        const value = record[key];
        if (value === undefined || value === null) continue;
        if (SECRET_KEY_RE.test(key)) {
            // Belt and braces. A key should never be authored into `target` if
            // it holds a credential, but authoring is not a guarantee, and the
            // cost of being wrong here is a secret in a screenshot.
            lines.push(`${humanizeKey(key)}: ***`);
            continue;
        }
        if (typeof value === 'string') {
            lines.push(
                `${humanizeKey(key)}: ${
                    value.length > CONSENT_DETAIL_VALUE_MAX
                        ? `${value.slice(0, CONSENT_DETAIL_VALUE_MAX)}… (${value.length} chars)`
                        : value
                }`,
            );
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            lines.push(`${humanizeKey(key)}: ${value}`);
        }
    }
    return lines.join('\n');
}

/**
 * The question, and the facts a person needs to answer it.
 *
 * Three parts and no more — what is about to happen, what it costs if wrong, and
 * WHICH one. A modal that is hard to read gets clicked through, which defeats
 * the gate entirely.
 *
 * @param toolName - the tool asking
 * @param args - the call's arguments; only authored target keys are read
 * @param fallbackTarget - names the open project, for tools that take no
 *   argument identifying what they act on (`republish`, `sync_content`)
 * @returns the title and the detail beneath it, or undefined for a tool with no
 *   authored copy — which cannot happen, since copy membership IS the gate
 */
export function buildConsentPrompt(
    toolName: string,
    args: unknown,
    fallbackTarget?: string,
): { title: string; detail: string } | undefined {
    const copy = alertCopyFor(toolName);
    if (!copy) return undefined;
    const target = copy.target.length
        ? renderTargetForConsent(args, copy.target)
        : (fallbackTarget ?? '');
    return {
        title: `Demo Builder: ${copy.action}?`,
        detail: [copy.consequence, target].filter(Boolean).join('\n\n'),
    };
}
