/**
 * Retry and Fix with AI on a failed install of the demo's datapack (step-04 S8; decisions J6-2,
 * J6-3). Retry starts the install from the flyout, of the whole pack to the project's target, as the
 * job window's Install sends it (`useRequestBody`); once it is accepted the window opens on its run,
 * where it picks the running job up. It is `useUndoLastSave`'s shape, for the same flyout. Whether
 * the install worked is the project's record, which the screen reads again when the window closes.
 *
 * Fix with AI asks the extension to open the SC's AI on the project's failed install
 * (`importFixHandlers.ts`, `from: 'install-failed'`), sending nothing of the flyout.
 *
 * @module features/data-installer/ui/hooks/useRetryInstall
 */

import React, { useCallback, useLayoutEffect, useRef } from 'react';
import type { StartImportPayload } from '../../handlers/importStart';
import { libraryField } from '../components/importModalJob';
import { useDataInstallerRequest } from './useDataInstallerRequest';
import type { HeldFailure } from './useProjectHolding';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
import type { FixDatapackImportWithAiRequest } from '@/types/webviewRequests';

/** The install's start, as the job window's: it answers once the job is accepted. */
const INSTALL_START = { timeout: TIMEOUTS.DATAPACK_SAVE_THEN_WRITE };
/** Fix with AI on the project's failed install. */
const FROM_INSTALL_FAILED: FixDatapackImportWithAiRequest = { from: 'install-failed' };

/** What a Retry installs, and where. */
export interface RetryInstallArgs {
    id: DatapackId;
    store: DatapackStoreName | undefined;
    /** The failure, with the project's instance and scope; none, nothing can be retried. */
    failed: HeldFailure | undefined;
    /** The data types the service holds for this version: a Retry installs every one. */
    types: readonly string[];
}

/** Retry, whether it is starting, why it could not, and Fix with AI. */
export interface RetryInstall {
    start: () => void;
    working: boolean;
    note: React.JSX.Element | null;
    fixWithAi: () => void;
}

/** The start's body: the whole pack, to the project's instance and its recorded scope. */
function retryBody({ id, store, failed, types }: RetryInstallArgs): StartImportPayload {
    return {
        datapackName: id.name,
        version: id.version,
        ...libraryField(store),
        commerceInstance: failed?.commerceInstance ?? '',
        dataTypes: [...types],
        ...(failed?.scope ? { websiteCode: failed.scope.websiteCode, storeCode: failed.scope.storeCode } : {}),
    };
}

/**
 * @param args - what a Retry installs and where
 * @param onStarted - opens the run on the datapack. Must be stable: an effect depends on it
 */
export function useRetryInstall(args: RetryInstallArgs, onStarted?: (id: DatapackId) => void): RetryInstall {
    const request = useDataInstallerRequest<{ activationId: string }>('start-datapack-import', INSTALL_START);
    // The datapack as it was when the SC pressed Retry.
    const retrying = useRef<DatapackId | undefined>(undefined);
    const run = request.load;
    const { id, store, failed, types } = args;
    const start = useCallback((): void => {
        retrying.current = id;
        run(retryBody({ id, store, failed, types }));
    }, [run, id, store, failed, types]);

    // Before the paint: the flyout goes from this wait to the run's window with nothing between them.
    const started = request.value;
    useLayoutEffect(() => {
        const to = retrying.current;
        if (!started || !to) return;
        retrying.current = undefined;
        onStarted?.(to);
    }, [started, onStarted]);

    const fixWithAi = useCallback((): void => {
        void webviewClient.request('fix-datapack-import-with-ai', FROM_INSTALL_FAILED);
    }, []);

    const note = request.failure ? (
        <p className="dialog-problem text-negative">The install couldn&rsquo;t be started: {request.failure.message}</p>
    ) : null;
    return { start, working: request.loading, note, fixWithAi };
}
