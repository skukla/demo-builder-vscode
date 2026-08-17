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

/**
 * Render a failure with the affordance that can actually fix it.
 *
 * @param failure - the flattened refusal or transport failure
 * @param onRetry - re-runs the request; also the sign-in trigger, since the
 *                  interactive guard prompts for Adobe sign-in on its way through
 * @returns the status block to render in place of the view's body
 */
export function renderDataInstallerFailure(
    failure: DataInstallerFailure,
    onRetry: () => void,
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
        return (
            <StatusDisplay
                variant="warning"
                title="The Data Installer is not configured"
                message={failure.message}
                details={[
                    'Set demoBuilder.dataInstaller.apiBaseUrl, and make sure demoBuilder.dataInstaller.enabled is on.',
                ]}
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
