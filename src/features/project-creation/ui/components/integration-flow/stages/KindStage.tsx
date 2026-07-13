/**
 * KindStage — the Add Integration flow's kind picker (stage id `'kind'`).
 *
 * Presentational {@link ChoiceCard}s in one row, grouped by how much we know
 * about the integration:
 *   - **API Mesh** — the data layer (rendered ONLY when offered; HIDDEN when the
 *     stack lacks it or it's already added — see {@link import('../flowStages').meshKindOffered}).
 *   - **Pre-built integration** — a finished catalog app (disabled with "None
 *     available yet" when the finished catalog is empty).
 *   - **Start from scratch** — a blank app you build out with AI (the shell).
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
    /** Whether the API Mesh kind is offered (hidden entirely when false). */
    meshOffered: boolean;
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
    meshOffered,
    catalogCount,
    kind,
    onPickKind,
}: KindStageProps): React.ReactElement {
    const catalogEmpty = catalogCount === 0;
    // 4 cards (mesh offered) → 2×2 grid; 3 cards (mesh hidden) → a single row.
    const layoutClass = meshOffered
        ? 'intflow-kind-choices'
        : 'intflow-kind-choices intflow-kind-choices--three';
    return (
        <div className={layoutClass}>
            {meshOffered ? (
                <ChoiceCard
                    name="API Mesh"
                    description="Combine your Commerce and other APIs behind a single GraphQL endpoint."
                    selected={kind === 'mesh'}
                    onSelect={() => onPickKind('mesh')}
                />
            ) : null}
            <ChoiceCard
                name="Pre-built integration"
                description="Pick a finished App Builder integration from the catalog."
                selected={kind === 'catalog'}
                disabled={catalogEmpty}
                note={catalogEmpty ? 'None available yet' : undefined}
                onSelect={() => onPickKind('catalog')}
            />
            <ChoiceCard
                name="Start from scratch"
                description="Begin with a blank App Builder app and build it out with AI."
                selected={kind === 'blank'}
                onSelect={() => onPickKind('blank')}
            />
            <ChoiceCard
                name="Import a repo"
                description="Add your own App Builder app from a public GitHub repository."
                selected={kind === 'custom'}
                onSelect={() => onPickKind('custom')}
            />
        </div>
    );
}
