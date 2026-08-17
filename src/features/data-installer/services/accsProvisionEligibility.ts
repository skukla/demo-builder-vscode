/**
 * Can console-free credential provisioning run for this project?
 *
 * One predicate with two callers, deliberately: the GUARD in
 * `provision-accs-credentials` that refuses without an Adobe binding, and the
 * OFFER — the `needsAccsCredentials` flag on a credential refusal, which is the
 * only thing that puts "Set up credentials automatically" in front of the user.
 *
 * They were separate, and they disagreed. A project with no Adobe binding got
 * the button, pressed it, and received a second refusal. An offer whose only
 * possible outcome is another refusal is worse than no offer, because it reads
 * as a way out.
 *
 * The underlying limit is real and not a UI bug: a datapack write authenticates
 * with an OAuth Server-to-Server pair, and one can be created only inside an
 * Adobe I/O project workspace. A project that selected no App Builder
 * components has no workspace to create it in. The honest surface for that is
 * the plain "credentials are missing" message with nothing to press.
 *
 * @module features/data-installer/services/accsProvisionEligibility
 */

/** The binding fields provisioning targets. */
interface AdobeBinding {
    organization?: string;
    projectId?: string;
    workspace?: string;
}

/** The three fields present once the check passes. */
type BoundToWorkspace = { organization: string; projectId: string; workspace: string };

/**
 * True when provisioning has somewhere to create the credential.
 *
 * Every field is load-bearing: the org scopes the Console call, the project and
 * workspace name the container the OAuth pair is created in.
 *
 * A type guard rather than a plain boolean, so the guard's caller keeps the
 * narrowing it had when the check was written inline — it passes all three
 * fields straight to the provisioner on the next line.
 */
export function canProvisionAccsCredentials<T extends AdobeBinding>(
    adobe: T | undefined,
): adobe is T & BoundToWorkspace {
    return Boolean(adobe?.organization && adobe.projectId && adobe.workspace);
}
