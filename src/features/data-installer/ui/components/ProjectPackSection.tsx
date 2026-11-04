/**
 * The demo's datapack, pinned above the catalog (owner, 2026-11-03, `.rptc/plans/datapack-save-as/`):
 * the pack the open project installs from and resets to, as its own card, with Save and Save As
 * beside it. The one way into a save: the header's Create Datapack and the pack menu's "Save
 * store changes" were two doors to an invisible pack, and the owner could not tell where a save
 * went.
 *
 * - **Save** appears only when the pack is the SC's own; someone else's pack is never written.
 * - **Save As** makes a new pack of the SC's, which the demo then uses.
 *
 * Shown only once the demo has a pack the catalog lists: before that, the header's Create Datapack
 * makes one (owner, 2026-11-03: a heading over a lone button read as broken).
 * - **Newer version** marks what the library has since the demo installed its pack
 *   (`newerVersionOf`); pressing it opens that version's panel, where it is installed.
 *
 * The card is the catalog's own `DatapackCard`, so the demo's pack looks as it does in the grid;
 * considered and not used, a bespoke summary row, which would be a second look for one pack.
 *
 * @module features/data-installer/ui/components/ProjectPackSection
 */

import { ActionButton, Button } from '@adobe/react-spectrum';
import React from 'react';
import type { DatapackGroup } from '../../services/datapackCatalog';
import type { CatalogPage } from '../../types';
import type { PackBeingSaved } from './create-flow/datapackFlowStages';
import { DatapackCard } from './DatapackCard';
import { DatapackSourceNotice } from './DatapackSourceNotice';
import { newerVersionOf, shortDate } from './projectPackNewer';
import { SectionLabel } from '@/core/ui/components/ui/SectionLabel';
import type { DatapackId, DatapackStoreName, ProjectDatapack } from '@/types/datapack';

export interface ProjectPackSectionProps {
    /** The pack the demo uses, as the project records it; none before its first. */
    held?: ProjectDatapack;
    /** That pack as the catalog lists it (its name, owner and versions), once found. */
    group?: DatapackGroup;
    /** When Demo Builder's engine installed it, when it did. */
    installedAt?: string;
    /** Save and Save As need Demo Builder's engine, which reads the store back. */
    canSave: boolean;
    onSave: (pack: PackBeingSaved) => void;
    onSaveAs: (suggestedName: string, pack?: PackBeingSaved) => void;
    onOpen: (id: DatapackId, store: DatapackStoreName) => void;
}

const NO_VERSION_CHANGE = (): void => undefined;

export function ProjectPackSection({ held, group, installedAt, canSave, onSave, onSaveAs, onOpen }: ProjectPackSectionProps): React.JSX.Element | null {
    // Only with its card: a pack the catalog does not list (deleted, or its store switched off) would
    // leave a heading over two bare buttons. The header's Create Datapack still makes one.
    if (!held || !group) return null;
    const pack: PackBeingSaved = { id: { name: held.name, version: held.version }, displayName: group.displayName, source: held.store ?? group.store };
    const newer = newerVersionOf(group, held, installedAt);
    const store = held.store ?? group.store;
    return (
        <section className="datapack-project-pack" aria-label="This Demo's Datapack">
            <SectionLabel>This Demo&rsquo;s Datapack</SectionLabel>
            <div className="datapack-project-pack-row">
                <div className="datapack-project-pack-card">
                    <DatapackCard group={group} selectedVersion={held.version} onVersionChange={NO_VERSION_CHANGE} onOpen={onOpen} />
                </div>
                <div className="datapack-project-pack-actions">
                    {newer ? (
                        <ActionButton isQuiet onPress={() => onOpen(newer.id, store)}>
                            Newer Version: {shortDate(newer.at)}
                        </ActionButton>
                    ) : null}
                    {canSave && group.mine ? (
                        <Button variant="accent" onPress={() => onSave(pack)}>
                            Save {pack.displayName}
                        </Button>
                    ) : null}
                    {canSave ? (
                        <Button variant="secondary" onPress={() => onSaveAs(`${pack.displayName} Copy`, pack)}>
                            Save As
                        </Button>
                    ) : null}
                </div>
            </div>
        </section>
    );
}

/** The demo's pack as the catalog lists it: the group of the same name in the store it came from. */
function groupOf(groups: DatapackGroup[], held: ProjectDatapack | undefined): DatapackGroup | undefined {
    if (!held) return undefined;
    return groups.find((group) => group.name === held.name && group.store === (held.store ?? 'installer')) ?? groups.find((group) => group.name === held.name);
}

export interface CatalogLeadProps {
    page: CatalogPage | null;
    onDismissNotice: () => void;
    /** What the open project records; none without one. */
    project?: { projectName?: string; datapack?: ProjectDatapack; installedAt?: string };
    groups: DatapackGroup[];
    canSave: boolean;
    saves: { offer: ProjectPackSectionProps['onSave']; offerSaveAs: ProjectPackSectionProps['onSaveAs'] };
    onOpen: ProjectPackSectionProps['onOpen'];
}

/**
 * What sits above the catalog's grid: the notice about where the list comes from, then the open
 * demo's pack. One component so the catalog view, already past its size, takes one import for both.
 */
export function CatalogLead({ page, onDismissNotice, project, groups, canSave, saves, onOpen }: CatalogLeadProps): React.JSX.Element {
    return (
        <>
            <DatapackSourceNotice page={page} onDismiss={onDismissNotice} />
            {project?.projectName ? (
                <ProjectPackSection
                    held={project.datapack}
                    group={groupOf(groups, project.datapack)}
                    installedAt={project.installedAt}
                    canSave={canSave}
                    onSave={saves.offer}
                    onSaveAs={saves.offerSaveAs}
                    onOpen={onOpen}
                />
            ) : null}
        </>
    );
}
