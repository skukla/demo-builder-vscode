/**
 * KindStage — the Add Integration flow's kind picker (stage id `'kind'`).
 *
 * Presentational: three equal-width {@link ChoiceCard}s in one row (API Mesh ·
 * Integration Catalog · Custom Integration) — the default row variant, NOT the catalog
 * gallery's small square tiles: with only three known kinds the cards stretch to fill
 * the modal's width. The mesh card renders ONLY when offered — the picker HIDES mesh
 * when the stack lacks it or it is already added (no disabled card; see
 * {@link import('../flowStages').meshKindOffered}). The catalog card is disabled with a
 * "None available yet" note when the catalog is empty. The selected card reflects `kind`.
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
    return (
        <div className="intflow-kind-choices">
            {meshOffered ? (
                <ChoiceCard
                    name="API Mesh"
                    description="Combine your Commerce and other APIs behind a single GraphQL endpoint."
                    selected={kind === 'mesh'}
                    onSelect={() => onPickKind('mesh')}
                />
            ) : null}
            <ChoiceCard
                name="Integration Catalog"
                description="Pick a pre-built App Builder integration."
                selected={kind === 'catalog'}
                disabled={catalogEmpty}
                note={catalogEmpty ? 'None available yet' : undefined}
                onSelect={() => onPickKind('catalog')}
            />
            <ChoiceCard
                name="Custom Integration"
                description="Add your own App Builder app from a public GitHub repository."
                selected={kind === 'custom'}
                onSelect={() => onPickKind('custom')}
            />
        </div>
    );
}
