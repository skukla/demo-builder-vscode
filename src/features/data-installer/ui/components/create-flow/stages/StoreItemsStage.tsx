/**
 * One kind's items to select, read when first opened (`list-datapack-export-items`, less what the
 * pack being saved holds). The read belongs to whoever shows the kind: each is keyed by kind, so an
 * answer arriving after the SC has moved on is dropped rather than taken for another kind's. Its
 * answer goes up to the flow, which keeps it, so the kind's row can say what it found.
 *
 * @module features/data-installer/ui/components/create-flow/stages/StoreItemsStage
 */

import React, { useEffect } from 'react';
import type { PickableKind, StoreItemPage } from '../../../../pickableKinds';
import { useDataInstallerRequest } from '../../../hooks/useDataInstallerRequest';
import { StoreKindItems } from '../../StoreKindItems';
import type { PackBeingSaved } from '../datapackFlowStages';

export interface StoreItemsStageProps {
    kind: PickableKind;
    pack?: PackBeingSaved;
    /** What an earlier read of this kind answered. */
    answered?: StoreItemPage;
    picked: string[];
    onChange: (ids: string[]) => void;
    /** Stable. */
    onAnswered: (kind: PickableKind, page: StoreItemPage | null) => void;
}

type KindReadArgs = Pick<StoreItemsStageProps, 'kind' | 'pack' | 'answered' | 'onAnswered'>;

function useKindRead({ kind, pack, answered, onAnswered }: KindReadArgs) {
    const { load, value, failure, settled } = useDataInstallerRequest<StoreItemPage>('list-datapack-export-items');
    const needsRead = answered === undefined;

    useEffect(() => {
        if (!needsRead) return;
        load({ dataType: kind, ...(pack ? { datapackName: pack.id.name, version: pack.id.version, source: pack.source } : {}) });
    }, [needsRead, load, kind, pack]);
    useEffect(() => {
        if (settled) onAnswered(kind, value);
    }, [settled, value, kind, onAnswered]);

    return { value, failure, loading: needsRead && !settled };
}

export function StoreItemsStage({ kind, pack, answered, picked, onChange, onAnswered }: StoreItemsStageProps): React.ReactElement {
    const { value, failure, loading } = useKindRead({ kind, pack, answered, onAnswered });
    return (
        <StoreKindItems
            kind={kind}
            page={answered ?? value}
            failure={failure?.message}
            loading={loading}
            picked={picked}
            onChange={onChange}
            packName={pack?.displayName}
        />
    );
}
