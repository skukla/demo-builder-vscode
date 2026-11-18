/**
 * useShareDatapack — the fix on Share Demo's datapack notice (owner, 2026-11-18, walk F229): a
 * pack only the SC can see stops colleagues using the demo's data, so the notice offers Share
 * Datapack. It is the Datapacks screen's Share, not a copy of it: the same hook
 * (`useLibrarySharing`, which sends `share-library-datapack`, the handler the `share_datapack`
 * tool dispatches) and the same question (`shareConfirmCopy`). It asks first, since a shared pack
 * is seen and installed by the whole team; once shared, the storefront is read again, so the
 * notice goes when the check passes.
 *
 * @module features/dashboard/ui/components/share/useShareDatapack
 */

import { useCallback, useState } from 'react';
import type { PlainText } from '@/features/data-installer/plainFailure';
import { useLibrarySharing } from '@/features/data-installer/ui/hooks/useLibrarySharing';
import type { DatapackId } from '@/types/datapack';
import type { DemoPackageCheck } from '@/types/webviewRequests';

/** What the notice's button and the window's question need. */
export interface ShareDatapackFix {
    /** The pack a check offers to share, and the name it is asked by; absent when none does. */
    offer?: { pack: DatapackId; displayName: string };
    /** The question is up: the window shows it in place of the form. */
    asking: boolean;
    ask: () => void;
    cancel: () => void;
    /** Share, as answered: the question goes and the share runs. */
    confirm: () => void;
    /** Sharing, or reading the storefront again after it: the button shows it is working. */
    pending: boolean;
    /** Why it could not be shared; nothing otherwise. */
    reason: PlainText | null;
}

/** Handed to the sharing hook when no check offers a pack: never sent, since nothing can ask. */
const NO_PACK: DatapackId = { name: '', version: '' };

/**
 * Share Datapack's state, for the checks the storefront read answered.
 *
 * @param checks - the checks on the link form
 * @param reread - read the storefront again once the pack is shared. Must be stable
 * @param rereading - that read is under way
 * @returns the fix
 */
export function useShareDatapack(
    checks: DemoPackageCheck[],
    reread: () => void,
    rereading: boolean,
): ShareDatapackFix {
    const offer = checks.find((check) => !check.ok && check.share)?.share;
    const sharing = useLibrarySharing(offer?.pack ?? NO_PACK, false, reread);
    const [asking, setAsking] = useState(false);
    const start = sharing.start;
    const confirm = useCallback((): void => {
        setAsking(false);
        start();
    }, [start]);
    return {
        ...(offer ? { offer } : {}),
        asking,
        ask: useCallback(() => setAsking(true), []),
        cancel: useCallback(() => setAsking(false), []),
        confirm,
        pending: sharing.working || rereading,
        reason: sharing.reason,
    };
}
