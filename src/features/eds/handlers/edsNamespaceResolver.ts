/**
 * EDS namespace resolver
 *
 * Decides which GitHub namespace (personal user or team org) to pre-select
 * in the wizard's namespace picker, given the user's available choices and
 * the team's `demoBuilder.eds.githubOrg` default-setting value.
 *
 * Per-demo choice always lives with the user (they can pick any option in
 * the picker). This helper only resolves the *default* selection, not the
 * final value.
 *
 * @module features/eds/handlers/edsNamespaceResolver
 */

import * as vscode from 'vscode';

/**
 * Resolve which namespace the picker should pre-select.
 *
 * Resolution order:
 *   1. If `demoBuilder.eds.githubOrg` is set AND the user is actually a
 *      member of that org, use the setting value.
 *   2. Otherwise (setting empty OR setting points at a non-member org),
 *      fall back to the user's personal GitHub username.
 *
 * Intentionally falls back rather than throwing on a stale/invalid setting
 * — if a team admin set the setting before a particular SC was added to
 * the org (or the SC was later removed), the wizard should still work
 * with the SC's personal namespace as the default. The SC can still pick
 * the team org from the picker if they later regain membership.
 *
 * @param githubUser - The authenticated user's GitHub login (from OAuth)
 * @param availableOrgs - The orgs the user is a member of (from getUserOrgs)
 * @returns The namespace to pre-select in the picker
 */
export function getDefaultNamespace(
    githubUser: string,
    availableOrgs: readonly string[],
): string {
    const setting = vscode.workspace
        .getConfiguration('demoBuilder.eds')
        .get<string>('githubOrg', '')
        .trim();

    if (setting && availableOrgs.includes(setting)) {
        return setting;
    }
    return githubUser;
}
