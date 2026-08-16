/**
 * Data Installer screen — the panel shell.
 *
 * Owns the page chrome and which view is on screen. It owns no data: each view
 * runs its own request behind the same handler guard, so a shell-level fetch
 * would only duplicate work every view already does.
 *
 * A composition of the shared vocabulary, per `reuse-first`: `PageLayout` +
 * `PageHeader` for the shell, `ViewSwitcher` (feature-local — see its docstring)
 * for the view strip.
 *
 * **The connectivity line is gone.** It called `check-datapack-service` on mount
 * and read `data.reachable` off the result — but a guard refusal RETURNS
 * `{success:false, …}` rather than throwing, so the whole `HandlerResponse` landed
 * in `data`, `reachable` read as `undefined`, and a signed-out user was told
 * "Connected to the Data Installer service". The catalog request goes through the
 * same guard and reports the same refusals correctly (see
 * `hooks/useDataInstallerRequest`), so the extra round trip bought nothing but a
 * slower first paint. The handler stays — step 12 exposes it as an MCP tool.
 *
 * @module features/data-installer/ui/DataInstallerScreen
 */

import React, { useState } from 'react';
import { ViewSwitcher, type SwitchableView } from './components/ViewSwitcher';
import { DatapackActivityView } from './views/DatapackActivityView';
import { DatapackCatalogView } from './views/DatapackCatalogView';
import { PageHeader } from '@/core/ui/components/layout/PageHeader';
import { PageLayout } from '@/core/ui/components/layout/PageLayout';

/** Init payload, owned by `ShowDataInstallerCommand.getInitialData()`. */
export interface DataInstallerScreenProps {
    theme?: 'dark' | 'light';
    projectName?: string;
}

/**
 * Views the panel can show.
 *
 * Module-level so the reference is stable across renders — an inline array is a
 * new reference every render and would re-fire any effect depending on it.
 *
 * Order is browse → what happened: the catalog is what the panel is FOR, and
 * the activity log is the diagnostic you reach for after.
 *
 * There was an Installed view between them. It listed what the SERVICE records
 * as installed, globally, across every instance anyone has used — and that
 * tracking is self-reported: `DELETE get-installed-datapacks` clears it without
 * uninstalling anything, so it can call a pack absent while its data sits on the
 * instance. A confident list that can be wrong in that direction is worse than
 * no list. What it uniquely answered — "has this pack been run here" — the
 * scoped activity log answers from the request log instead.
 */
const VIEWS: SwitchableView[] = [
    { id: 'catalog', label: 'Catalog' },
    { id: 'activity', label: 'Activity' },
];

export function DataInstallerScreen(_props: DataInstallerScreenProps): React.JSX.Element {
    const [activeView, setActiveView] = useState(VIEWS[0].id);

    return (
        <PageLayout
            header={
                <PageHeader
                    title="Data Installer"
                    subtitle="Browse and install Adobe Commerce sample-data datapacks"
                    // Aligns the title with the content band below it. Both
                    // page-level peers set it; without it the header ran the full
                    // panel width while the body sat in a 960px column.
                    constrainWidth
                />
            }
            backgroundColor="var(--spectrum-global-color-gray-50)"
        >
            {/* Constrained like every other band on the page. */}
            <div className="page-container-padded">
                <ViewSwitcher views={VIEWS} activeId={activeView} onSelect={setActiveView} />
            </div>
            {/* Mounted one at a time on purpose: each view owns its own request,
                so keeping the others mounted would spend round trips on screens
                nobody is looking at. The cost is a re-fetch when you switch back,
                which is the cheaper of the two. */}
            {renderView(activeView)}
        </PageLayout>
    );
}

/** The body for the active view id. */
function renderView(activeView: string): React.JSX.Element | null {
    if (activeView === 'activity') {
        return <DatapackActivityView />;
    }
    return <DatapackCatalogView />;
}
