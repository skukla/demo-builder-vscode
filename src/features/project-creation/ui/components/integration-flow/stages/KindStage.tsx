/**
 * KindStage — the Add Integration flow's kind picker (stage id `'kind'`).
 *
 * Presentational {@link ChoiceCard}s in one row, grouped by how much we know
 * about the integration:
 *   - **API Mesh** — the data layer. HIDDEN when the stack has no mesh (nothing to
 *     explain), but shown DISABLED with "Already added — one per project" once the
 *     project has one: an absent tile reads the same as a stack that never offered
 *     one, which is the question the note answers.
 *   - **Pre-built integration** — a finished catalog app (disabled with "None
 *     available yet" when the finished catalog is empty).
 *   - **Build custom** — a blank app you build out with AI (the shell).
 *   - **Import a repo** — bring your own App Builder app from a GitHub URL.
 *
 * The last two are the two "custom app" flavors, presented as flat sibling cards.
 * The selected card reflects `kind`.
 *
 * @module features/project-creation/ui/components/integration-flow/stages/KindStage
 */

import React from 'react';
import { ChoiceCard } from '../../ChoiceCard';
import type { IntegrationKind } from '../flowStages';

export interface KindStageProps {
    /** Whether this stack has a mesh at all (hidden entirely when false). */
    meshAvailable: boolean;
    /** Whether the project already HAS its mesh (tile shown, but disabled). */
    meshAlreadyAdded: boolean;
    /** Number of pre-built catalog entries (0 disables the catalog tile). */
    catalogCount: number;
    /** The draft's picked kind (marks its tile selected). */
    kind?: IntegrationKind;
    /** Pick a kind. */
    onPickKind: (kind: IntegrationKind) => void;
}

/**
 * The kind-picker stage body.
 *
 * @param props - mesh availability, catalog count, the picked kind, and the pick callback
 * @returns the tile row
 */
export function KindStage({
    meshAvailable,
    meshAlreadyAdded,
    catalogCount,
    kind,
    onPickKind,
}: KindStageProps): React.ReactElement {
    const catalogEmpty = catalogCount === 0;
    // No per-count layout class: the grid is auto-fit/minmax, so 4 cards land 2×2
    // and 3 land in a row at this width, without a variant to keep in sync.
    return (
        <div className="intflow-kind-choices">
            {/* Absent vs disabled carry DIFFERENT meanings, so they are separate
                inputs. No mesh for this stack → no tile (there is nothing to
                explain). A mesh already added → the tile stays, disabled, saying
                why: a project gets exactly one, and a tile that simply vanished
                looked identical to a stack that never offered one. Same
                disabled+note treatment the catalog tile uses when it is empty. */}
            {meshAvailable ? (
                <ChoiceCard
                    name="API Mesh"
                    description="Combine your Commerce and other APIs behind a single GraphQL endpoint."
                    selected={kind === 'mesh'}
                    disabled={meshAlreadyAdded}
                    note={meshAlreadyAdded ? 'Already added — one per project' : undefined}
                    onSelect={() => onPickKind('mesh')}
                />
            ) : null}
            <ChoiceCard
                name="Pre-built integration"
                description="Pick a finished integration from the catalog."
                selected={kind === 'catalog'}
                disabled={catalogEmpty}
                note={catalogEmpty ? 'None available yet' : undefined}
                onSelect={() => onPickKind('catalog')}
            />
            <ChoiceCard
                name="Build custom"
                description="Begin with a blank custom integration and build it out with AI."
                selected={kind === 'blank'}
                onSelect={() => onPickKind('blank')}
            />
            <ChoiceCard
                name="Import a repo"
                description="Add your own custom integration from a public GitHub repository."
                selected={kind === 'custom'}
                onSelect={() => onPickKind('custom')}
            />
        </div>
    );
}
