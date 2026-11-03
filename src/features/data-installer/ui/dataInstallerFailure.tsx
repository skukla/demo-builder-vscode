/**
 * The one failure treatment for every Data Installer view.
 *
 * Each view calls the same handler guard (`resolveDataInstallerAccess`), so each
 * can be refused for the same four reasons and must offer the same affordance
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
    /** One extra line, for a surface that can say what still works without it. Shown on every failure. */
    extraDetail?: string;
    /**
     * The title when nothing answered, for a surface that is not only about the Data Installer. Its
     * failure is the datapack store's, so the Data Installer's own advice is not offered with it.
     */
    unreachableTitle?: string;
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
    // What still works without the Data Installer, on every failure, not only the settings
    // one: a 404 from a deployment that had gone left a colleague looking at Retry with
    // nothing saying the project could go ahead (beta.149, 2026-10-26).
    const extra = options.extraDetail ? [options.extraDetail] : undefined;
    if (failure.code === ErrorCode.AUTH_REQUIRED) {
        return (
            <StatusDisplay
                variant="info"
                title="Adobe Sign-In Required"
                message="Sign in with Adobe to browse datapacks."
                details={extra}
                actions={[{ label: 'Sign In with Adobe', onPress: onRetry, variant: 'primary' }]}
            />
        );
    }

    // Signed in, and the service turned the sign-in away: Sign In would hand it the same one.
    // Usually the address points at a deployment that does not take this sign-in.
    if (failure.code === ErrorCode.AUTH_FORBIDDEN && !options.unreachableTitle) {
        const details = ['Check the Data Installer address in settings.'];
        if (options.extraDetail) {
            details.push(options.extraDetail);
        }
        return (
            <StatusDisplay
                variant="warning"
                title="The Data Installer didn't accept your sign-in"
                message={failure.message}
                details={details}
                actions={[
                    ...(options.onOpenSettings
                        ? [{ label: 'Open Settings', onPress: options.onOpenSettings, variant: 'secondary' as const }]
                        : []),
                    { label: 'Retry', onPress: onRetry, variant: 'primary' as const },
                ]}
            />
        );
    }

    if (failure.code === ErrorCode.INVALID_OPERATION && !options.unreachableTitle) {
        const details = [
            'Set demoBuilder.dataInstaller.apiBaseUrl.',
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
            title={options.unreachableTitle ?? 'Could Not Reach the Data Installer'}
            message={failure.message}
            details={extra}
            actions={[{ label: 'Retry', onPress: onRetry, variant: 'primary' }]}
        />
    );
}
