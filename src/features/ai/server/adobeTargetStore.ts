/**
 * adobeTargetStore — per-server (per-VS-Code-window) Adobe session target.
 *
 * MCP tool invocations are separate calls, so a per-invocation `withOrgContext`
 * alone can't carry the user's org/project/workspace selection across tool
 * calls. This module is a tiny module-level holder: `select_*` tools WRITE the
 * chosen target here, and every Adobe-touching tool READS it (via
 * `runWithAdobeTarget`) to run its `aio` work under the right org context
 * WITHOUT mutating the shared `aio` global.
 *
 * The in-extension MCP server is per VS-Code window, so a single module-level
 * target is correct — one selection at a time — and is naturally isolated
 * across windows (each window is its own extension-host process).
 */

import { withOrgContext, type OrgContextTarget } from '@/core/shell';

/** The active session target, or undefined when nothing has been selected. */
let target: OrgContextTarget | undefined;

/** Get a copy of the stored session target, or undefined when none is set. */
export function getAdobeTarget(): OrgContextTarget | undefined {
    return target ? { ...target } : undefined;
}

/** Replace the stored session target wholesale (a new selection). */
export function setAdobeTarget(next: OrgContextTarget): void {
    target = { ...next };
}

/** Clear the stored session target. */
export function clearAdobeTarget(): void {
    target = undefined;
}

/**
 * Run `fn` under `withOrgContext` with the stored session target so any `aio`
 * work inside it targets the selected org/project/workspace via env (no global
 * mutation). When nothing is stored, `fn` runs with no active org context
 * (today's untargeted behavior), which is safe.
 */
export function runWithAdobeTarget<T>(fn: () => Promise<T>): Promise<T> {
    const current = getAdobeTarget();
    return current ? withOrgContext(current, fn) : fn();
}
