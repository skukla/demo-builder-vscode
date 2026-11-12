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

/**
 * Save As's first screen: the new datapack's name, which the SC sees it called (the library's own
 * name for it is generated, `packIdFor`). Starts empty, as Create Datapack's does.
 */
export function SaveAsNameStage({ name, onChange, intro }: { name: string; onChange: (name: string) => void; intro?: string }): React.ReactElement {
    return (
        <>
            {/* What the save takes, and that it makes a new pack (`saveWords.SAVE_AS_INTRO`). */}
            {intro ? <p className="datapack-export-intro">{intro}</p> : null}
                <FormField
                fieldKey="saveAsName"
                label="Datapack Name"
                type="text"
                value={name}
                onChange={onChange}
                required
                placeholder="e.g. My Bodea"
            />
    
        </>
    );
}

export function PackNameStage({ answers }: { answers: ExportAnswers }): React.ReactElement {
    return (
        <>
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
