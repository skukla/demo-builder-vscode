/**
 * The sign-in every Data Installer request carries: the IMS bearer and, when the SC's
 * org is known, `x-gw-ims-org-id`.
 *
 * The org header is what Adobe's gateway asks for once an action is deployed with
 * `require-adobe-auth: true` (the service's security fix, DEMOSYS-1695, 2026-10-14).
 * Measured 2026-10-27 on its Stage deployment: find-datapacks with the bearer alone
 * answered 401 "missing x-gw-ims-org-id header"; with the header, 200 and 42 datapacks.
 * A deployment without the gateway check ignores the header.
 *
 * One place, because both clients send it (read and write), and a header added to one
 * of them is the defect.
 *
 * @module features/data-installer/services/dataInstallerSignIn
 */

/** How a client signs its requests. */
export interface DataInstallerSignIn {
    /** Resolves a fresh IMS bearer. Called per request: tokens expire. */
    getToken: () => Promise<string>;
    /** The SC's IMS org CODE (`…@AdobeOrg`), when known. */
    orgCode?: string;
}

/**
 * The headers that sign one request.
 *
 * @param signIn - the bearer and the org
 * @returns `Authorization`, plus `x-gw-ims-org-id` when the org is known
 */
export async function signInHeaders(signIn: DataInstallerSignIn): Promise<Record<string, string>> {
    return {
        Authorization: `Bearer ${await signIn.getToken()}`,
        ...(signIn.orgCode ? { 'x-gw-ims-org-id': signIn.orgCode } : {}),
    };
}
