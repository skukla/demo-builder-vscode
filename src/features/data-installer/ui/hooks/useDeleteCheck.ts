/**
 * Delete's check before it asks (owner, 2026-11-20): the flyout asked "will be deleted. This can't be
 * undone." and only then said a demo used the datapack, so it could not be. Pressing Delete now asks
 * the delete door without confirm, which writes nothing and answers who uses the datapack
 * (`inUseAnswer` in `datapackLibraryHandlers`): any user, and the window says so in place of the
 * question; none, and the question opens as before.
 *
 * @module features/data-installer/ui/hooks/useDeleteCheck
 */

import { useCallback, useState } from 'react';
import { useIsMounted } from '@/core/ui/hooks/useIsMounted';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { andList } from '@/core/utils/andList';
import type { DatapackId } from '@/types/datapack';
import type { HandlerResponse } from '@/types/handlers';

/** Who uses the datapack, as the delete door answers it. */
export interface PackInUse {
    users: string[];
    /** The open demo is one of them: the window offers Uninstall. */
    open: boolean;
}

export interface DeleteCheck {
    /** Ask the door; `ask` opens the question when nothing uses it. */
    start: (ask: () => void) => void;
    checking: boolean;
    /** Who uses it, once the check found someone; cleared by `dismiss`. */
    inUse: PackInUse | undefined;
    dismiss: () => void;
}

/** The `inUse` the door's refusal carries, when it does. */
function inUseOf(answer: HandlerResponse): PackInUse | undefined {
    const data = answer.data as { inUse?: PackInUse } | undefined;
    return data?.inUse && data.inUse.users.length > 0 ? data.inUse : undefined;
}

/**
 * @param everyVersion - the delete takes every version (a pack of saves), so the check does too
 */
export function useDeleteCheck(id: DatapackId, everyVersion: boolean): DeleteCheck {
    const [checking, setChecking] = useState(false);
    const [inUse, setInUse] = useState<PackInUse | undefined>(undefined);
    const mounted = useIsMounted();
    const start = useCallback(
        (ask: () => void): void => {
            setChecking(true);
            const payload = {
                datapackName: id.name,
                ...(everyVersion ? { everyVersion: true } : { version: id.version }),
            };
            void webviewClient
                .request<HandlerResponse>('delete-library-datapack', payload)
                // No answer: the question still opens, and the confirmed delete refuses if it must.
                .catch((): HandlerResponse => ({ success: false }))
                .then((answer) => {
                    if (!mounted.current) return;
                    setChecking(false);
                    const users = inUseOf(answer);
                    if (users) setInUse(users);
                    else ask();
                });
        },
        [id.name, id.version, everyVersion, mounted],
    );
    const dismiss = useCallback((): void => setInUse(undefined), []);
    return { start, checking, inUse, dismiss };
}

/**
 * The window's line: who uses it, and where to uninstall it. "Here" when the open demo is the only
 * one, which its Uninstall button does.
 */
export function inUseLine(inUse: PackInUse): string {
    const { users } = inUse;
    const who = users.length === 1 ? `${users[0]} uses it` : `${andList(users)} use it`;
    const where = inUse.open && users.length === 1 ? 'here' : 'there';
    return `${who}. Uninstall it ${where} first.`;
}
