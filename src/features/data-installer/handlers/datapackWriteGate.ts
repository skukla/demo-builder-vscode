/**
 * The gate every datapack WRITE passes before a request is built.
 *
 * Import, validate, reset and both export calls open the same way: the Data
 * Installer must be configured and signed in, a project must be open, and that
 * project must yield usable Commerce credentials. A credential gap is a reason
 * with its own wording, and on the ACCS gap the response carries the flag that
 * makes the panel offer console-free provisioning. Only the verb in the copy
 * differs between import and export. One gate, so a new write handler cannot
 * skip a check and the two sides cannot drift (PL-69 pair 25).
 *
 * The payload checks stay with each caller: they differ on purpose (an export
 * has no target scope; an import has no selections).
 *
 * @module features/data-installer/handlers/datapackWriteGate
 */

import { canProvisionAccsCredentials } from '../services/accsProvisionEligibility';
import { resolveProjectCredentials } from '../services/commerceCredentialBroker';
import type { CommerceCredentials } from '../services/dataInstallerWriteClient';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** Which write is asking; picks the copy a refusal shows. */
export type DatapackWrite = 'import' | 'export';

/** What a write needs once the gate has passed. */
export interface DatapackWriteAccess {
    baseUrl: string;
    getToken: () => Promise<string>;
    project: Project;
    credentials: CommerceCredentials;
}

/** The refusal when no project is open, verbatim per write. */
const NO_PROJECT: Record<DatapackWrite, string> = {
    import: 'Open a project before importing a datapack.',
    export: 'Open a project before exporting.',
};

/**
 * Wording for each credential gap, verbatim per write so a grep for the message
 * still finds it. The broker returns reasons only.
 */
const CREDENTIAL_MESSAGES: Record<DatapackWrite, Record<string, string>> = {
    import: {
        'missing-paas-admin':
            'This project has no Commerce admin username and password saved, so an import cannot authenticate.',
        // "Add them" was the whole story when the user was the only source. There
        // are now two, and on a project with no Adobe workspace the OTHER one
        // failing is the likelier cause — so the message says both what did not
        // happen and the two ways forward. The service is never named: this repo is
        // public and the string ships in the VSIX.
        'needs-accs-credentials':
            'ACCS imports need an Adobe OAuth Server-to-Server client id and secret, and the shared credential service did not supply one. Add the pair to this project, or ask an administrator for access to the shared credential.',
        'unsupported-backend':
            'This project has no Adobe Commerce backend, so there is nothing to import into.',
        // Distinct from the gap above because the remedy is: the extension has no
        // shared credential service to fall back on, and that is a setting the user
        // can add. Naming the setting is safe; naming its value would not be.
        'no-credential-service':
            'ACCS imports need an Adobe OAuth Server-to-Server client id and secret, and no shared credential service is configured to supply one. Add a service under demoBuilder.accsDiscovery.services, or add the pair to this project.',
    },
    export: {
        'missing-paas-admin':
            'This project has no Commerce admin username and password saved, so an export cannot authenticate.',
        'needs-accs-credentials':
            'ACCS exports need an Adobe OAuth Server-to-Server client id and secret, and the shared credential service did not supply one. Add the pair to this project, or ask an administrator for access to the shared credential.',
        'unsupported-backend':
            'This project has no Adobe Commerce backend, so there is nothing to export from.',
        'no-credential-service':
            'ACCS exports need an Adobe OAuth Server-to-Server client id and secret, and no shared credential service is configured to supply one. Add a service under demoBuilder.accsDiscovery.services, or add the pair to this project.',
    },
};

/**
 * Open a datapack write: access, project, credentials, in that order.
 *
 * @param context - The handler context the write was called with
 * @param write - Which write is asking; picks the refusal copy
 * @returns What the write needs, or the response to return instead
 */
export async function resolveDatapackWriteAccess(
    context: HandlerContext,
    write: DatapackWrite,
): Promise<DatapackWriteAccess | { response: HandlerResponse }> {
    const access = await resolveDataInstallerAccess(context);
    if (!access.ok) {
        return { response: access.response };
    }

    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { response: { success: false, error: NO_PROJECT[write] } };
    }

    const credentials = await resolveProjectCredentials(context, project);
    if (!credentials.ok) {
        return {
            response: {
                success: false,
                error:
                    CREDENTIAL_MESSAGES[write][credentials.reason] ??
                    'Commerce credentials are missing.',
                code: ErrorCode.INVALID_OPERATION,
                // The UI offers console-free provisioning on exactly this gap —
                // matching a message string would be the brittle version of
                // this. The Adobe-binding half is what makes the offer
                // honourable: without a workspace the button has nowhere to
                // create the pair and can only refuse a second time.
                data: {
                    needsAccsCredentials:
                        credentials.reason === 'needs-accs-credentials' &&
                        canProvisionAccsCredentials(project.adobe),
                },
            },
        };
    }

    return {
        baseUrl: access.baseUrl,
        getToken: access.getToken,
        project,
        credentials: credentials.credentials,
    };
}
