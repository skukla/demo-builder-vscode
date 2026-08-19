/**
 * Why Helix does not know a site — as far as we can actually tell.
 *
 * `admin.hlx.page/status/{owner}/{repo}/main` answers about the SITE, not
 * about the AEM Code Sync GitHub App. Measured 2026-08-19 against the live
 * service, with a control:
 *
 *     skukla/kukla-bodea      -> 404  x-error: [admin] no such site
 *     skukla/team-bodea-demo  -> 401  x-error: [admin] not authenticated
 *
 * The 404 arrives BEFORE authentication, so it is about the request, not the
 * credential — and a site Helix does know answers 401 instead, which is what
 * makes the two distinguishable at all.
 *
 * That 404 is returned for at least three different causes, and the codebase
 * has been reading it as one: `appInstallationResolver` maps it to
 * `not-installed`, which `storefrontSetupPhase3` turns into a hard halt saying
 * "AEM Code Sync is not installed on {owner}" — and on a team org, "ask your
 * team admin to install it". Said to someone whose App is already installed,
 * that is a false errand for two people, and it fires after Phases 1 and 2
 * have already written to their repository.
 *
 * **There is no App detector, and there cannot be one here.** GitHub refuses:
 * `GET /user/installations` needs a user-to-server token issued by the App
 * itself (measured: 403), `GET /repos/{owner}/{repo}/installation` needs the
 * App's own JWT, and `aem-code-sync` is Adobe's App — we hold neither. So the
 * honest move is not to invent a detector but to stop claiming one: name the
 * causes we CAN check, and state the remaining one as the inference it is.
 *
 * @module features/eds/utils/siteUnknownReason
 */

/**
 * The branch every EDS path targets: the Helix status URL in
 * `githubAppService`, `DEFAULT_BRANCH` in `helixService`, and the template
 * reset's `git clone --depth 1 --branch main`.
 */
const REQUIRED_BRANCH = 'main';

/** Why `admin.hlx.page` reports no such site. */
export type SiteUnknownReason =
    /** Nothing downstream targets this branch, so Helix was asked about a ref that does not exist. */
    | { kind: 'wrong-default-branch'; branch: string }
    /** The repo exists on main but is not an Edge Delivery storefront. */
    | { kind: 'not-a-storefront'; missing: string[] }
    /**
     * Everything checkable passes and Helix still does not know the site.
     *
     * An INFERENCE, not a measurement — but a well-founded one: installing the
     * App is what makes Helix aware of a repo, which is why the new-repo flow
     * works (create from template → install → `/status` starts answering).
     * Say it as a likely cause with an action, never as a verified fact.
     */
    | { kind: 'app-probably-missing' };

/**
 * Explain a Helix "no such site" from the preconditions we can verify.
 *
 * Takes primitives rather than the readiness/repo types so the one
 * implementation can be imported by BOTH the webview (which cannot load
 * anything touching `vscode`) and the extension's setup phases. Two copies of
 * this judgement drifting apart is precisely the failure it exists to fix.
 *
 * Unknown inputs are never treated as diagnosed causes: a repo list cached
 * before `defaultBranch` existed carries no branch, and readiness may still be
 * in flight. Both fall through to the inference, no better or worse informed
 * than if we had never looked.
 *
 * @param checks.defaultBranch - The repo's default branch, when known
 * @param checks.missingFiles - Canonical storefront files absent from the repo,
 *   when readiness has answered. An empty array means the repo IS a storefront.
 * @returns The most actionable cause we can support
 */
export function explainSiteUnknown(checks: {
    defaultBranch?: string;
    missingFiles?: string[];
}): SiteUnknownReason {
    // Branch first: it comes first in the causal chain. Fixing the files while
    // the branch is wrong changes nothing, because the reset that would write
    // them clones `--branch main`.
    if (checks.defaultBranch && checks.defaultBranch !== REQUIRED_BRANCH) {
        return { kind: 'wrong-default-branch', branch: checks.defaultBranch };
    }

    if (checks.missingFiles && checks.missingFiles.length > 0) {
        return { kind: 'not-a-storefront', missing: checks.missingFiles };
    }

    return { kind: 'app-probably-missing' };
}

/**
 * One sentence naming the cause and the remedy, for whichever surface asks.
 *
 * Shared so the wizard and the setup halt cannot describe the same verdict
 * differently — they did, and one of them was wrong.
 *
 * @param reason - The classified cause
 * @param repoFullName - `owner/repo`, for a message the user can act on
 * @returns User-facing explanation
 */
export function describeSiteUnknown(reason: SiteUnknownReason, repoFullName: string): string {
    switch (reason.kind) {
        case 'wrong-default-branch':
            return (
                `Edge Delivery builds from ${REQUIRED_BRANCH}, but ${repoFullName} defaults to ` +
                `${reason.branch}. Rename its default branch to ${REQUIRED_BRANCH} on GitHub, ` +
                'or choose a different repository.'
            );
        case 'not-a-storefront':
            return (
                `${repoFullName} is not an Edge Delivery storefront yet — it is missing ` +
                `${reason.missing.join(', ')}. Setup resets it from the template first.`
            );
        case 'app-probably-missing':
            return (
                `Adobe does not recognise ${repoFullName} as a site. The usual cause is that the ` +
                'AEM Code Sync GitHub App is not installed on it. If it is already installed, ' +
                'the repository may still be registering — wait a moment and check again.'
            );
    }
}
