/**
 * useConfigureSave Hook
 *
 * Owns the Configure screen's footer actions: Save (one `save-configuration` request
 * carrying only what the SC changed, PL-76), Close, and the two busy flags that disable both —
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
import type { BlockLibrarySelection } from './useBlockLibrarySelection';
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
    /**
     * Only the values that differ from what the screen loaded. Sending every loaded
     * value let a window opened before another change put the old values back.
     */
    configChanges: ComponentConfigs;
    /** Which declared secrets the project already holds (booleans only). */
    componentSecretFlags: Record<string, Record<string, boolean>>;
    /** Field keys the user has edited. */
    touchedFields: Set<string>;
    /** EDS project — gates sending the authoring-experience preference. */
    isEds: boolean;
    /** The authoring-experience choice (sent only for EDS projects, and only once changed). */
    authoringExperience: AuthoringExperience;
    /** The choice the screen loaded with. */
    initialAuthoringExperience: AuthoringExperience;
    /**
     * The block libraries to record (EDS only). Undefined while the SC has not
     * touched the picker, and then nothing about them is sent.
     */
    blockLibrarySelection?: BlockLibrarySelection;
    /** Told what a successful save sent, so the field values can start over from it. */
    onSaved?: (sent: ComponentConfigs) => void;
}

export interface UseConfigureSaveReturn {
    /** A save request is in flight. */
    isSaving: boolean;
    /** The extension reports a deployment in progress. */
    isDeploying: boolean;
    /** Send what the SC changed to the extension. */
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
    configChanges,
    componentSecretFlags,
    touchedFields,
    isEds,
    authoringExperience,
    initialAuthoringExperience,
    blockLibrarySelection,
    onSaved,
}: UseConfigureSaveProps): UseConfigureSaveReturn {
    const [isSaving, setIsSaving] = useState(false);
    const [isDeploying, setIsDeploying] = useState(false);
    // What the project holds as of the last save from this window. The window stays
    // open after Save; compared with what it OPENED with, a rename and then a rename
    // back looked like "no change" the second time (owner, 2026-10-17).
    const [savedName, setSavedName] = useState<string>(() => getProjectDisplayName(project));
    const [savedAuthoring, setSavedAuthoring] = useState(initialAuthoringExperience);

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
                projectName.trim() !== savedName ? projectName.trim() : undefined;
            // The authoring-experience preference is EDS-only, and like the block
            // libraries it rides only once changed.
            const authoringChanged = authoringExperience !== savedAuthoring;
            const result = await webviewClient.request<SaveConfigurationResponse>(
                'save-configuration',
                {
                    configChanges: withStoredSecretsPreserved(
                        configChanges,
                        componentSecretFlags,
                        touchedFields,
                    ),
                    newProjectName,
                    ...(isEds
                        ? {
                              ...(authoringChanged ? { authoringExperience } : {}),
                              ...blockLibrarySelection,
                          }
                        : {}),
                },
            );
            if (!result.success) {
                throw new Error(result.error || 'Failed to save configuration');
            }
            if (newProjectName) setSavedName(newProjectName);
            if (isEds) setSavedAuthoring(authoringExperience);
            onSaved?.(configChanges);
        } catch {
            // Error handled by extension - no action needed
            // Extension shows user-facing error message via webview communication
        } finally {
            setIsSaving(false);
        }
    }, [
        configChanges,
        // Both feed the stored-secret filter. A stale closure here would send the
        // blank placeholder and delete the credential — the exact failure the
        // filter exists to prevent.
        componentSecretFlags,
        touchedFields,
        projectName,
        // The baselines handleSave compares against. A stale closure here would
        // compare a new name against an old one and silently drop the rename.
        savedName,
        savedAuthoring,
        isEds,
        authoringExperience,
        blockLibrarySelection,
        onSaved,
    ]);

    const handleCancel = useCallback(() => {
        webviewClient.postMessage('cancel');
    }, []);

    return { isSaving, isDeploying, handleSave, handleCancel };
}
