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
 * Module-level so the reference is stable across renders. One entry today, which
 * is why no switcher renders yet — `ViewSwitcher` hides itself below two views
 * rather than showing a lone tab. The installed and activity views join this list.
 */
const VIEWS: SwitchableView[] = [{ id: 'catalog', label: 'Catalog' }];

export function DataInstallerScreen(_props: DataInstallerScreenProps): React.JSX.Element {
    const [activeView, setActiveView] = useState(VIEWS[0].id);

    return (
        <PageLayout
            header={
                <PageHeader
                    title="Data Installer"
                    subtitle="Browse and install Adobe Commerce sample-data datapacks"
                />
            }
        >
            <ViewSwitcher views={VIEWS} activeId={activeView} onSelect={setActiveView} />
            {activeView === 'catalog' ? <DatapackCatalogView /> : null}
        </PageLayout>
    );
}
