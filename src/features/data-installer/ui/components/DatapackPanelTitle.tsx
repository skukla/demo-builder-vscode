/**
 * The pack flyout's title: renamable in place on the SC's own library pack (datapack-engine
 * step 07, through the house `InlineRenameField`), plain text otherwise.
 *
 * @module features/data-installer/ui/components/DatapackPanelTitle
 */

import React from 'react';
import type { DatapackDetail } from '../../types';
import { InlineRenameField } from '@/core/ui/components/forms/InlineRenameField';
import type { DatapackId } from '@/types/datapack';

export interface DatapackPanelTitleProps {
    title: string;
    /** The loaded pack; null while it loads or after it failed, when the title is plain. */
    detail: DatapackDetail | null;
    /** Resolve null on success, or the reason to show inline. */
    onRename?: (id: DatapackId, displayName: string) => Promise<string | null>;
}

/** The flyout's title. */
export function DatapackPanelTitle({ title, detail, onRename }: DatapackPanelTitleProps): React.JSX.Element {
    if (!onRename || !detail || detail.store !== 'library' || detail.mine !== true) return <>{title}</>;
    return (
        <InlineRenameField
            name={title}
            label="New datapack name"
            onRename={(displayName) => onRename(detail.id, displayName)}
        />
    );
}
