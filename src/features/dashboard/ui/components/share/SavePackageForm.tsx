/**
 * Save as Package's form (EDS-72): Name and Description, prefilled as Send a Link's are
 * (`ShareDetails`), and, for a project already on the Welcome step, a quiet Remove Package link
 * under them, with its spinner beside it while it runs. Its main button, Save as Package, is the
 * window's footer button (`SavePackageModal`), as Share's forms' are.
 *
 * @module features/dashboard/ui/components/share/SavePackageForm
 */

import React from 'react';
import { SAVE_PACKAGE_COPY } from './savePackageCopy';
import { ShareDetails } from './ShareDetails';
import type { UseSavePackage } from './useSavePackage';
import { Spinner } from '@/core/ui/components/ui/Spinner';

/** Remove Package: a quiet link under the fields, with its spinner beside it while it runs. */
function RemoveLink({ flow }: { flow: UseSavePackage }): React.ReactElement {
    return (
        <div className="share-remove-row">
            <button
                type="button"
                className="inline-action-link share-remove"
                onClick={flow.remove}
                disabled={flow.busy !== undefined}
            >
                {SAVE_PACKAGE_COPY.remove}
            </button>
            {flow.busy === 'remove' ? <Spinner size="S" aria-label={SAVE_PACKAGE_COPY.remove} /> : null}
        </div>
    );
}

/**
 * The form.
 *
 * @param props.flow - the window's state (`useSavePackage`)
 * @returns the fields, and Remove Package when there is a card to remove
 */
export function SavePackageForm({ flow }: { flow: UseSavePackage }): React.ReactElement {
    return (
        <div className="export-link" data-testid="save-package-form">
            <ShareDetails flow={flow} />
            {flow.onList ? <RemoveLink flow={flow} /> : null}
        </div>
    );
}
