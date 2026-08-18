/**
 * The one failure treatment for every Data Installer view.
 *
 * Each view calls the same handler guard (`resolveDataInstallerAccess`), so each
 * can be refused for the same three reasons and must offer the same affordance
 * for each. Moved out of `DataInstallerScreen` when the catalog view arrived,
 * before a second copy could be written: the installed and activity views are
 * next, and this is exactly the shape that drifts when it is copied.
 *
 * The house rule it encodes: **signed-out is never a Retry.** It is a
 * `StatusDisplay` whose action starts a user-initiated sign-in (`AdobeAuthStep`
 * is the reference).
 *
 * @module features/data-installer/ui/dataInstallerFailure
 */

import React from 'react';
import type { DataInstallerFailure } from './hooks/useDataInstallerRequest';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { ErrorCode } from '@/types/errorCodes';

/** Per-surface extras for the configuration refusal. */
export interface DataInstallerFailureOptions {
    /**
     * Opens VS Code settings at `demoBuilder.dataInstaller`. Supplied by surfaces
     * whose host registers `open-data-installer-settings`.
     *
     * Naming a setting is only half an answer — `apiBaseUrl` ships with no
     * default (this repository is public), so on a fresh install the FIRST thing
     * every user meets is this refusal, and the fix is a settings key they then
     * have to go hunting for.
     */
    onOpenSettings?: () => void;
    /** One extra line, for a surface that can say what still works without it. */
    extraDetail?: string;
}

/**
 * Render a failure with the affordance that can actually fix it.
 *
 * @param failure - the flattened refusal or transport failure
 * @param onRetry - re-runs the request; also the sign-in trigger, since the
 *                  interactive guard prompts for Adobe sign-in on its way through
 * @param options - per-surface extras for the configuration refusal
 * @returns the status block to render in place of the view's body
 */
export function renderDataInstallerFailure(
    failure: DataInstallerFailure,
    onRetry: () => void,
    options: DataInstallerFailureOptions = {},
): React.JSX.Element {
    if (failure.code === ErrorCode.AUTH_REQUIRED) {
        return (
            <StatusDisplay
                variant="info"
                title="Adobe sign-in required"
                message="Sign in with Adobe to browse datapacks."
                actions={[{ label: 'Sign In with Adobe', onPress: onRetry, variant: 'primary' }]}
            />
        );
    }

    if (failure.code === ErrorCode.INVALID_OPERATION) {
        const details = [
            'Set demoBuilder.dataInstaller.apiBaseUrl, and make sure demoBuilder.dataInstaller.enabled is on.',
        ];
        if (options.extraDetail) {
            details.push(options.extraDetail);
        }
        return (
            <StatusDisplay
                variant="warning"
                title="The Data Installer is not configured"
                message={failure.message}
                details={details}
                actions={
                    options.onOpenSettings
                        ? [
                              {
                                  label: 'Open Settings',
                                  onPress: options.onOpenSettings,
                                  variant: 'primary',
                              },
                          ]
                        : undefined
                }
            />
        );
    }

    return (
        <StatusDisplay
            variant="error"
            title="Could not reach the Data Installer"
            message={failure.message}
            actions={[{ label: 'Try Again', onPress: onRetry, variant: 'primary' }]}
        />
    );
}
