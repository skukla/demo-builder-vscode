/**
 * Patch target policy
 *
 * Decides which files a code patch is permitted to modify.
 *
 * Code patches are fetched from a public repo (`skukla/eds-demo-patches`) and
 * their `replacement` content is written into the colleague's storefront repo,
 * where it runs in demo audiences' browsers. Until this check existed, nothing
 * constrained the `target` field — a ledger entry naming `package.json` or
 * `.github/workflows/*` would be written as readily as `blocks/header/header.js`.
 * Those two are the reason this matters: a dependency addition executes
 * arbitrary code at install time, and write access to a workflow is write
 * access to that repository's secrets.
 *
 * This lives in the extension on purpose. Branch protection and CI on the
 * patches repo fail at exactly the moment they are needed, because an account
 * compromise takes the workflow with it too. A check at the point of
 * consumption is the only one that holds.
 *
 * The allowlist matches actual usage rather than anticipated usage: every
 * target across all five live ledgers sits under `blocks/` or `scripts/` and
 * ends in `.js`. A future patch outside that fails loudly through the patch
 * report, and the rule gets widened deliberately.
 *
 * NOTE: the same rule is enforced independently in the `eds-demo-patches` CI
 * validator. That duplication is intentional — CI protects the repo, this
 * protects the user, and they must not depend on each other.
 *
 * @module features/eds/services/patches/patchTargetPolicy
 */

/** Directory prefixes a patch may write into. Trailing slash is load-bearing:
 *  it stops `blocksy/…` from matching `blocks`. */
const ALLOWED_PREFIXES = ['blocks/', 'scripts/'] as const;

/** Only JavaScript is patched today. */
const ALLOWED_EXTENSION = '.js';

export interface PatchTargetVerdict {
    allowed: boolean;
    /** Present on every refusal — surfaced through the patch report. */
    reason?: string;
}

const ALLOW: PatchTargetVerdict = { allowed: true };

function refuse(reason: string): PatchTargetVerdict {
    return { allowed: false, reason };
}

/**
 * Check whether a patch may modify the given repo-relative path.
 *
 * @param target - Repo-relative path from a patch ledger entry
 * @returns Whether the write is permitted, and why not when it isn't
 */
export function checkPatchTarget(target: string): PatchTargetVerdict {
    if (!target || target.trim().length === 0) {
        return refuse('Patch target is empty');
    }

    // Checked before anything else: a leading slash or a traversal segment can
    // carry a path out of the repo entirely, so neither is worth normalizing.
    if (target.startsWith('/')) {
        return refuse(`Patch target '${target}' is an absolute path`);
    }
    if (target.includes('..') || target.includes('\\')) {
        return refuse(`Patch target '${target}' contains a path escape`);
    }

    if (!ALLOWED_PREFIXES.some((prefix) => target.startsWith(prefix))) {
        return refuse(
            `Patch target '${target}' is outside the permitted directories ` +
                `(${ALLOWED_PREFIXES.join(', ')})`,
        );
    }

    if (!target.endsWith(ALLOWED_EXTENSION)) {
        return refuse(`Patch target '${target}' is not a ${ALLOWED_EXTENSION} file`);
    }

    return ALLOW;
}
