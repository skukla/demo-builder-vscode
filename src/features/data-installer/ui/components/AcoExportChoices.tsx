/**
 * An ACO pack's store views and kinds on the export screen (datapack-engine step 14 item 19).
 * Drawn by `ServiceExportModal` in place of the Commerce export's data types; its state is
 * `useAcoExportChoice`. The pickers are the same checkbox grid the data types use. The pack-type
 * radio that stood above them moved to "Create datapack" (`CreateDatapackModal`, 2026-10-30).
 *
 * @module features/data-installer/ui/components/AcoExportChoices
 */

import { Checkbox } from '@adobe/react-spectrum';
import React from 'react';
import { dataTypeLabel } from '../dataTypeLabel';
import type { AcoExportChoice } from '../hooks/useAcoExportChoice';

/** The store views list, or why there is none. */
function storeViewChoices(choice: AcoExportChoice): React.JSX.Element {
    if (choice.loadingViews) return <p className="datapack-export-note">Reading the store views</p>;
    if (choice.storeViews.length === 0) {
        return (
            <p className="datapack-export-note">
                The store views could not be listed, so the pack is made for every one.
            </p>
        );
    }
    return (
        <div className="datapack-type-grid">
            {choice.storeViews.map((view) => (
                <Checkbox
                    key={view.code}
                    isSelected={choice.pickedViews.includes(view.code)}
                    onChange={(on) => choice.toggleView(view.code, on)}
                >
                    {`${view.name} (${view.websiteName})`}
                </Checkbox>
            ))}
        </div>
    );
}

/** An ACO pack's store views and kinds. */
function AcoPackChoices({ choice }: { choice: AcoExportChoice }): React.JSX.Element {
    return (
        <>
            <div className="datapack-import-types">
                <span className="datapack-import-label">Store views</span>
                {storeViewChoices(choice)}
            </div>
            <div className="datapack-import-types">
                <span className="datapack-import-label">ACO data types</span>
                <div className="datapack-type-grid">
                    {choice.kinds.map((kind) => (
                        <Checkbox
                            key={kind}
                            isSelected={choice.pickedKinds.includes(kind)}
                            onChange={(on) => choice.toggleKind(kind, on)}
                        >
                            {dataTypeLabel(kind)}
                        </Checkbox>
                    ))}
                </div>
            </div>
        </>
    );
}

/**
 * An ACO pack's store views and kinds, or else the Commerce export's own choices, handed in as
 * children. The pack type is chosen before this screen, in "Create datapack".
 */
export function AcoExportChoices({
    choice,
    children,
}: {
    choice: AcoExportChoice;
    children: React.ReactNode;
}): React.JSX.Element {
    return (
        <>{choice.isAco ? <AcoPackChoices choice={choice} /> : children}</>
    );
}
