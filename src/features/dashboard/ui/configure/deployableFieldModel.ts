/**
 * Deployable Field Model (D2 Track B — Step 04)
 *
 * Pure assembly: turns each selected deployable's catalog `envSchema` into the
 * render model for the Configure surface, applying the Step-01 3-bucket rule via
 * `classifyEnvSchema`. Keeps the React component presentational and the bucketing
 * un-forked (reuses the classifier).
 *
 * @module features/dashboard/ui/configure/deployableFieldModel
 */

import { classifyEnvSchema } from '@/features/project-creation/services/envVarClassifier';
import type { DeployableCatalogEntry, DeployableEnvVar } from '@/types/deployables';

/** A read-only "connected" row sourced from a provider (bucket 2). */
export interface ConnectedFieldModel {
    name: string;
    label: string;
    /** The provider deployable id (e.g. "commerce-paas-mesh"). */
    providedBy: string;
    /** The resolved provided value, if known yet. */
    value?: string;
}

/** One deployable's render group: only present when it has visible fields. */
export interface DeployableFieldGroup {
    id: string;
    label: string;
    /** Bucket-3 text vars → componentConfigs → .env. */
    textFields: DeployableEnvVar[];
    /** Bucket-3 secret vars → masked input → SecretStorage. */
    secretFields: DeployableEnvVar[];
    /** Bucket-2 providedBy vars → read-only "connected" rows. */
    connectedFields: ConnectedFieldModel[];
}

/**
 * Build the field groups for the Configure surface from the deployable catalog.
 *
 * Bucket 1 (auto-provisioned / derivedFrom) is dropped entirely. A deployable
 * with no bucket-2/bucket-3 fields (e.g. a seed mesh whose only var is derived)
 * yields NO group, so it renders zero new inputs.
 *
 * @param catalog - Catalog entries for the project's selected deployables
 * @param provided - Resolved provided env values (e.g. { MESH_ENDPOINT })
 * @returns One group per deployable that has at least one visible field
 */
export function buildDeployableFieldGroups(
    catalog: DeployableCatalogEntry[],
    provided: Record<string, string>,
): DeployableFieldGroup[] {
    const groups: DeployableFieldGroup[] = [];

    for (const entry of catalog) {
        const { userText, userSecret, autoWired } = classifyEnvSchema(entry.envSchema ?? []);

        const connectedFields: ConnectedFieldModel[] = autoWired.map(v => ({
            name: v.name,
            label: v.label,
            providedBy: v.providedBy as string,
            value: provided[v.name],
        }));

        if (userText.length === 0 && userSecret.length === 0 && connectedFields.length === 0) {
            continue;
        }

        groups.push({
            id: entry.id,
            label: entry.name,
            textFields: userText,
            secretFields: userSecret,
            connectedFields,
        });
    }

    return groups;
}
