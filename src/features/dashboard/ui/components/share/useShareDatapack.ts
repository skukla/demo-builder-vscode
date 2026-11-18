/**
 * useShareDatapack — the fix on Share Demo's datapack notice (owner, 2026-11-18, walk F229): a
 * pack only the SC can see stops colleagues using the demo's data, so the notice offers Share
 * Datapack. It is the Datapacks screen's Share, not a copy of it: the same hook
 * (`useLibrarySharing`, which sends `share-library-datapack`, the handler the `share_datapack`
 * tool dispatches) and the same question (`shareConfirmCopy`). It asks first, since a shared pack
 * is seen and installed by the whole team. Once the share answers, the notice says so at once
 * (`shared`, walk F237: the button had waited on the storefront read that follows, which can
 * answer late and before the library says shared, so no success ever showed); that read still
 * runs, for the other checks, and holds nothing.
 *
 * @module features/dashboard/ui/components/share/useShareDatapack
 */

import { useCallback, useRef, useState } from 'react';
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
    /** Sharing: the button shows it is working. */
    pending: boolean;
    /** The pack's name once the share answered: the notice says it is shared (walk F237). */
    shared?: string;
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
 * @returns the fix
 */
export function useShareDatapack(checks: DemoPackageCheck[], reread: () => void): ShareDatapackFix {
    const offer = checks.find((check) => !check.ok && check.share)?.share;
    const offered = useRef(offer?.displayName);
    if (offer) offered.current = offer.displayName;
    const [shared, setShared] = useState<string | undefined>();
    const onShared = useCallback((): void => {
        setShared(offered.current);
        reread();
    }, [reread]);
    const sharing = useLibrarySharing(offer?.pack ?? NO_PACK, false, onShared);
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
        pending: sharing.working,
        ...(shared ? { shared } : {}),
        reason: sharing.reason,
    };
}
