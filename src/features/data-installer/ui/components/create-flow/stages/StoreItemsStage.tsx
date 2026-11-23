/**
 * One kind's items to select, read when first opened (`list-datapack-export-items`). The read belongs to whoever shows the kind: each is keyed by kind, so an
 * answer arriving after the SC has moved on is dropped rather than taken for another kind's. Its
 * answer goes up to the flow, which keeps it, so the kind's row can say what it found.
 *
 * @module features/data-installer/ui/components/create-flow/stages/StoreItemsStage
 */

import React, { useEffect } from 'react';
import type { PickableKind, StoreItemPage } from '../../../../pickableKinds';
import { useDataInstallerRequest } from '../../../hooks/useDataInstallerRequest';
import { StoreKindItems } from '../../StoreKindItems';

export interface StoreItemsStageProps {
    kind: PickableKind;
    /** What an earlier read of this kind answered. */
    answered?: StoreItemPage;
    picked: string[];
    /** The kind is ticked whole: every item it lists is ticked, from the first frame it lists them. */
    whole: boolean;
    onChange: (ids: string[]) => void;
    /** Stable. */
    onAnswered: (kind: PickableKind, page: StoreItemPage | null) => void;
}

type KindReadArgs = Pick<StoreItemsStageProps, 'kind' | 'answered' | 'onAnswered'>;

function useKindRead({ kind, answered, onAnswered }: KindReadArgs) {
    const { load, value, failure, settled } = useDataInstallerRequest<StoreItemPage>('list-datapack-export-items');
    const needsRead = answered === undefined;

    useEffect(() => {
        if (!needsRead) return;
        load({ dataType: kind });
    }, [needsRead, load, kind]);
    useEffect(() => {
        if (settled) onAnswered(kind, value);
    }, [settled, value, kind, onAnswered]);

    return { value, failure, loading: needsRead && !settled };
}

export function StoreItemsStage({ kind, answered, picked, whole, onChange, onAnswered }: StoreItemsStageProps): React.ReactElement {
    const { value, failure, loading } = useKindRead({ kind, answered, onAnswered });
    const page = answered ?? value;
    return (
        <StoreKindItems
            kind={kind}
            page={page}
            failure={failure?.message}
            loading={loading}
            picked={whole ? (page?.items.map((item) => item.id) ?? picked) : picked}
            onChange={onChange}
        />
    );
}
