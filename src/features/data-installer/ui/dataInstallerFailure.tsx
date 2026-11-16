/**
 * The one failure treatment for every Data Installer view.
 *
 * Each view calls the same handler guard (`resolveDataInstallerAccess`), so each
 * can be refused for the same four reasons and must offer the same affordance
 * for each. Moved out of `DataInstallerScreen` when the catalog view arrived,
 * before a second copy could be written: the installed and activity views are
 * next, and this is exactly the shape that drifts when it is copied.
 *
 * The house rules it encodes: **signed-out is never a Retry.** It is a
 * `StatusDisplay` whose action starts a user-initiated sign-in (`AdobeAuthStep`
 * is the reference). And **a message that names a setting opens it**: the failure
 * carries the setting's id and gets an Open Settings button.
 *
 * @module features/data-installer/ui/dataInstallerFailure
 */

import React from 'react';
import type { DataInstallerFailure } from './hooks/useDataInstallerRequest';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { ErrorCode } from '@/types/errorCodes';

/** Per-surface extras. */
export interface DataInstallerFailureOptions {
    /** One extra line, for a surface that can say what still works without it. Shown on every failure. */
    extraDetail?: string;
    /**
     * The title when nothing answered, for a surface that is not only about the Data Installer. Its
     * failure is the datapack store's, so the Data Installer's own advice is not offered with it.
     */
    unreachableTitle?: string;
}

type Action = { label: string; onPress: () => void; variant: 'primary' | 'secondary' };

/**
 * Open Settings, when the failure's message sends the SC to a setting: the button opens that
 * setting (owner rule, release test 1.4, 2026-11-16). The handler names the setting with its
 * message, so the words and the button cannot point at two different places.
 */
function openSettingAction(failure: DataInstallerFailure, variant: Action['variant']): Action[] {
    if (!failure.setting) return [];
    const setting = failure.setting;
    return [{ label: 'Open Settings', onPress: () => webviewClient.postMessage('open-setting', { setting }), variant }];
}

/**
 * Render a failure with the affordance that can actually fix it.
 *
 * @param failure - the flattened refusal or transport failure
 * @param onRetry - re-runs the request; also the sign-in trigger, since the
 *                  interactive guard prompts for Adobe sign-in on its way through
 * @param options - per-surface extras
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
    const retry: Action = { label: 'Retry', onPress: onRetry, variant: 'primary' };
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

    // Signed in, and the store turned the sign-in away. The message says why, in the store's
    // name; it used to carry the store's raw reply plus advice about the Data Installer's
    // address, which was wrong for the datapack library (release test 1.4).
    if (failure.code === ErrorCode.AUTH_FORBIDDEN && !options.unreachableTitle) {
        return (
            <StatusDisplay
                variant="warning"
                title="Sign-In Not Accepted"
                message={failure.message}
                details={extra}
                actions={[...openSettingAction(failure, 'secondary'), retry]}
            />
        );
    }

    if (failure.code === ErrorCode.INVALID_OPERATION && !options.unreachableTitle) {
        const settings = openSettingAction(failure, 'primary');
        return (
            <StatusDisplay
                variant="warning"
                title="Datapacks Not Set Up"
                message={failure.message}
                details={extra}
                actions={settings.length > 0 ? settings : undefined}
            />
        );
    }

    return (
        <StatusDisplay
            variant="error"
            title={options.unreachableTitle ?? "Couldn't Load Datapacks"}
            message={failure.message}
            details={extra}
            actions={[...openSettingAction(failure, 'secondary'), retry]}
        />
    );
}
