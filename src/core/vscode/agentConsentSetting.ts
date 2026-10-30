/**
 * Whether the SC's AI asks before it changes anything: `demoBuilder.ai.requireAgentConsent`.
 *
 * On by default. Off means a consequential agent tool runs without asking, which the
 * agent server needs to know before it asks, and which the Updates window needs so it
 * never tells the SC "nothing goes live until you approve it" when nothing will ask
 * (owner, 2026-10-30). Read live on every call, so flipping it needs no reload.
 *
 * @module core/vscode/agentConsentSetting
 */

import * as vscode from 'vscode';

/** True unless the SC turned `demoBuilder.ai.requireAgentConsent` off. */
export function agentConsentRequired(): boolean {
    return vscode.workspace.getConfiguration('demoBuilder').get<boolean>('ai.requireAgentConsent', true) !== false;
}
