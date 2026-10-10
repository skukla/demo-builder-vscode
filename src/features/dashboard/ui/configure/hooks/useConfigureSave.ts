/**
 * useConfigureSave Hook
 *
 * Owns the Configure screen's footer actions: Save (one `save-configuration` request
 * carrying EVERY section's values), Close, and the two busy flags that disable both —
 * our own save in flight, and a mesh/storefront deployment the extension reports over
 * `deployment-status`.
 *
 * Moved out of ConfigureScreen (EDS-8) unchanged.
 *
 * @module features/dashboard/ui/configure/hooks/useConfigureSave
 */

import { useCallback, useEffect, useState } from 'react';
import type { SaveConfigurationResponse } from '../configureTypes';
import { withStoredSecretsPreserved } from '../storedSecretPayload';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { AuthoringExperience, Project } from '@/types/base';
import type { ComponentConfigs } from '@/types/webview';
import type { DeploymentStatusPayload } from '@/types/webviewPayloads';

export interface UseConfigureSaveProps {
    /** The project being configured (its display name decides whether to rename). */
    project: Project;
    /** The project title as typed. */
    projectName: string;
    /** Every section's values, keyed by component id. */
    componentConfigs: ComponentConfigs;
    /** Which declared secrets the project already holds (booleans only). */
    componentSecretFlags: Record<string, Record<string, boolean>>;
    /** Field keys the user has edited. */
    touchedFields: Set<string>;
    /** EDS project — gates sending the authoring-experience preference. */
    isEds: boolean;
    /** The authoring-experience choice (sent only for EDS projects). */
    authoringExperience: AuthoringExperience;
}

export interface UseConfigureSaveReturn {
    /** A save request is in flight. */
    isSaving: boolean;
    /** The extension reports a deployment in progress. */
    isDeploying: boolean;
    /** Send the whole configuration to the extension. */
    handleSave: () => Promise<void>;
    /** Close the Configure panel. */
    handleCancel: () => void;
}

/**
 * Manage Save and Close for the Configure screen.
 *
 * @param props - everything the save payload is built from
 * @returns the busy flags and the two footer handlers
 */
export function useConfigureSave({
    project,
    projectName,
    componentConfigs,
    componentSecretFlags,
    touchedFields,
    isEds,
    authoringExperience,
}: UseConfigureSaveProps): UseConfigureSaveReturn {
    const [isSaving, setIsSaving] = useState(false);
    const [isDeploying, setIsDeploying] = useState(false);

    // Listen for deployment status updates from backend
    // This keeps the Save button disabled during mesh/storefront deployment
    useEffect(() => {
        const unsubscribe = webviewClient.onMessage('deployment-status', (data) => {
            const payload = data as DeploymentStatusPayload;
            setIsDeploying(payload.isDeploying);
        });
        return unsubscribe;
    }, []);

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        try {
            // Include projectName if it changed
            // Compare against the TITLE, so editing only the capitalisation of a
            // title still counts as a change. Comparing to the slug would treat
            // "bodea demo" -> "Bodea Demo" as a no-op and silently discard it.
            const newProjectName =
                projectName.trim() !== getProjectDisplayName(project)
                    ? projectName.trim()
                    : undefined;
            // The authoring-experience preference is EDS-only; for non-EDS projects
            // it is omitted entirely so the payload shape is unchanged.
            const result = await webviewClient.request<SaveConfigurationResponse>(
                'save-configuration',
                {
                    componentConfigs: withStoredSecretsPreserved(
                        componentConfigs,
                        componentSecretFlags,
                        touchedFields,
                    ),
                    newProjectName,
                    ...(isEds ? { authoringExperience } : {}),
                },
            );
            if (!result.success) {
                throw new Error(result.error || 'Failed to save configuration');
            }
        } catch {
            // Error handled by extension - no action needed
            // Extension shows user-facing error message via webview communication
        } finally {
            setIsSaving(false);
        }
    }, [
        componentConfigs,
        // Both feed the stored-secret filter. A stale closure here would send the
        // blank placeholder and delete the credential — the exact failure the
        // filter exists to prevent.
        componentSecretFlags,
        touchedFields,
        projectName,
        // `project`, not `project.name`: handleSave now compares against
        // `getProjectDisplayName(project)`, which reads `title` too. Depending on
        // `.name` alone left a stale closure that would compare a new title
        // against an old one and silently drop the rename.
        project,
        isEds,
        authoringExperience,
    ]);

    const handleCancel = useCallback(() => {
        webviewClient.postMessage('cancel');
    }, []);

    return { isSaving, isDeploying, handleSave, handleCancel };
}
