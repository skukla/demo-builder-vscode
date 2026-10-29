/**
 * The Datapacks step's note about a pack the project arrived with that the catalog does not
 * list (datapack-engine step 07): what creation will install instead (the pack it was made
 * from, or none), with one action to choose it now. Built on the house `InlineNotice`.
 *
 * @module features/project-creation/ui/steps/RecordedPackNotice
 */

import { Button } from '@adobe/react-spectrum';
import React, { useEffect } from 'react';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import type { DatapackGroup } from '@/features/data-installer/services/datapackCatalog';
import { useDataInstallerRequest } from '@/features/data-installer/ui/hooks/useDataInstallerRequest';
import { type ProjectDatapack, type RecordedPackCheck, storeOf } from '@/types/datapack';

/** Is this card the pack named (by store and name)? */
export function isPack(group: DatapackGroup, pack: ProjectDatapack | undefined): boolean {
    return pack !== undefined && pack.name === group.name && storeOf(pack) === group.store;
}

/** Does the catalog list this pack, at this version? */
export function isListed(groups: DatapackGroup[], pack: ProjectDatapack): boolean {
    const group = groups.find((candidate) => isPack(candidate, pack));
    return group !== undefined && group.versions.some((row) => row.id.version === pack.version);
}

/**
 * What creation will do with a recorded pack the catalog does not list: install the
 * pack it was made from, or no sample data. The same answer the build acts on
 * (`checkRecordedPack`), so the step and the build agree. Nothing when the pack can be
 * read after all, or the store could not be asked.
 */
export function RecordedPackNotice({
    recorded,
    onUse,
}: {
    recorded: ProjectDatapack;
    onUse: (pack: ProjectDatapack) => void;
}): React.JSX.Element | null {
    const { load, value } = useDataInstallerRequest<RecordedPackCheck>('check-recorded-datapack');
    useEffect(() => {
        load({ datapack: recorded });
    }, [load, recorded]);
    if (value?.verdict === 'fallback') {
        const fallback = value.pack;
        return (
            <InlineNotice
                title="This project's datapack can't be read"
                testId="recorded-datapack-notice"
                action={
                    <Button variant="secondary" onPress={() => onUse(fallback)}>
                        Continue with {value.displayName}
                    </Button>
                }
            >
                {value.note}
            </InlineNotice>
        );
    }
    if (value?.verdict === 'none') {
        return (
            <InlineNotice title="This project's datapack can't be read" testId="recorded-datapack-notice">
                {value.note}
            </InlineNotice>
        );
    }
    return null;
}
