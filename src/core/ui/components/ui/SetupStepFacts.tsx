/**
 * One manual setup step's Where / Enter / Then / Why, as the demo setup guide draws it: the Admin
 * menu path as breadcrumbs, each value to enter as a copyable pill, then what to do next and why.
 *
 * Extracted 2026-10-30 (datapack-engine step 12) from the setup guide's `SetupGuideStep.tsx`
 * (`StepFacts`, `WhereLine`, moved unchanged) when the Data Installer's pack flyout needed the same
 * step for the one Admin step a pack can leave. The rules moved unchanged, in the same layer, from
 * the dashboard's `integrations.css` to `core/ui/styles/fact-list.css`, which each host bundle
 * imports (dashboard, integrations, dataInstaller).
 *
 * @module core/ui/components/ui/SetupStepFacts
 */

import React from 'react';
import { CopyableText } from './CopyableText';
import { Fact, FactList } from './FactList';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

/** The Admin menu path as breadcrumbs, or the sentence when the catalog gives no path. */
function WhereLine({ item }: { item: SetupChecklistItem }): React.ReactElement {
    if (!item.path) return <span>{item.where}</span>;
    return (
        <span className="setup-guide-path" aria-label={item.path.join(' > ')}>
            {item.path.map((segment, i) => (
                <React.Fragment key={`${i}-${segment}`}>
                    {i > 0 && (
                        <span className="setup-guide-crumb-sep" aria-hidden="true">
                            ›
                        </span>
                    )}
                    <span className="setup-guide-crumb">{segment}</span>
                </React.Fragment>
            ))}
        </span>
    );
}

/** Where / Enter / Then / Why: labelled lines that scan as one small table. */
export function SetupStepFacts({ item }: { item: SetupChecklistItem }): React.ReactElement {
    return (
        <FactList>
            <Fact label="Where">
                <WhereLine item={item} />
            </Fact>
            {item.enter && (
                <Fact label="Enter">
                    <div className="setup-guide-pills">
                        {item.enter.map((value) => (
                            <CopyableText key={value}>{value}</CopyableText>
                        ))}
                    </div>
                </Fact>
            )}
            {item.then && <Fact label="Then">{item.then}</Fact>}
            {/* Left out when empty: a result that hands over a step has already said why. */}
            {item.why ? (
                <Fact label="Why">
                    <span className="setup-guide-why">{item.why}</span>
                </Fact>
            ) : null}
        </FactList>
    );
}
