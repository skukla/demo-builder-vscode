/**
 * An export's last screen: the name and version, both typed and required, then Export.
 *
 * The shared catalog gets a line, because other teams read those names. An ACO pack goes in the SC's
 * own library, as its card on the first screen said, so it needs none.
 *
 * @module features/data-installer/ui/components/create-flow/stages/PackNameStage
 */

import React from 'react';
import type { ExportAnswers } from '../useExportAnswers';
import { FormField } from '@/core/ui/components/forms/FormField';

export function PackNameStage({ answers, sharedCatalog }: {
    answers: ExportAnswers;
    /** The pack goes in the shared catalog. */
    sharedCatalog: boolean;
}): React.ReactElement {
    return (
        <>
            {sharedCatalog ? (
                <p className="datapack-export-intro">
                    Other teams see this name and version in the shared catalog.
                </p>
            ) : null}
            <FormField
                fieldKey="datapackName"
                label="Datapack Name"
                type="text"
                value={answers.name}
                onChange={answers.setName}
                required
                placeholder="e.g. citisignal-snapshot"
            />
            <FormField
                fieldKey="version"
                label="Version"
                type="text"
                value={answers.version}
                onChange={answers.setVersion}
                required
                placeholder="e.g. main"
            />
        </>
    );
}
