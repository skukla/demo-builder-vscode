/**
 * The storefront report as a window over the project dashboard (EDS-64): what needs the
 * SC's attention first (the storefront needs a reset; links that go to pages that do not
 * exist), then where the storefront comes from, then the detail folded away.
 *
 * Reading it changes nothing. Its one action that writes is the dashboard's own Reset,
 * which asks first; "Edit in DA.live" opens the page that carries a broken link.
 *
 * Replaces a markdown document beside the dashboard, followed by modals that offered to
 * change the storefront's code (owner, 2026-10-23).
 *
 * @module features/dashboard/ui/components/StorefrontReportModal
 */

import { Button, Link, Text } from '@adobe/react-spectrum';
import React from 'react';
import { useStorefrontReport } from '../hooks/useStorefrontReport';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { Modal } from '@/core/ui/components/ui/Modal';
import { SectionLabel } from '@/core/ui/components/ui/SectionLabel';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { StorefrontReportView } from '@/types/webviewPayloads';

export interface StorefrontReportModalProps {
    /** The project as the SC named it, for the title. */
    projectName: string;
    onClose: () => void;
    /** The dashboard's Reset, which asks first. */
    onReset: () => void;
}

/** Open a page in the DA.live editor, through the dashboard's checked opener. */
function editInDaLive(url: string): void {
    webviewClient.postMessage('openDaLive', { url });
}

function linkCount(count: number): string {
    return count === 1 ? "1 link goes to a page that doesn't exist" : `${count} links go to pages that don't exist`;
}

/** What needs the SC: a reset, broken links, or a line saying nothing does. */
function Attention({ view, onReset }: { view: StorefrontReportView; onReset: () => void }): React.ReactElement {
    if (!view.needsReset && view.brokenLinks.length === 0) {
        return <InlineNotice tone="info" title="Nothing needs your attention." testId="storefront-report-nothing" />;
    }
    return (
        <>
            {view.needsReset ? (
                <InlineNotice
                    title="Needs reset"
                    testId="storefront-report-needs-reset"
                    action={
                        <Button variant="secondary" onPress={onReset}>
                            Reset
                        </Button>
                    }
                >
                    {view.needsReset}
                </InlineNotice>
            ) : null}
            {view.brokenLinks.length > 0 ? (
                <InlineNotice
                    tone="info"
                    title={linkCount(view.brokenLinks.length)}
                    hint="They came with the copied content, and the site it came from has no such pages either."
                    testId="storefront-report-broken-links"
                >
                    <ul className="storefront-report-links">
                        {view.brokenLinks.map(({ link, pages }) => (
                            <li key={link}>
                                {link}, on{' '}
                                {pages.map(({ path, editUrl }, index) => (
                                    <React.Fragment key={path}>
                                        {index > 0 ? ', ' : null}
                                        {editUrl ? (
                                            <Link isQuiet onPress={() => editInDaLive(editUrl)}>
                                                {path}
                                            </Link>
                                        ) : (
                                            path
                                        )}
                                    </React.Fragment>
                                ))}
                            </li>
                        ))}
                    </ul>
                </InlineNotice>
            ) : null}
        </>
    );
}

/** Where the storefront comes from, then the detail folded away. */
function About({ view }: { view: StorefrontReportView }): React.ReactElement {
    return (
        <>
            <dl className="storefront-report-about">
                {view.about.map(({ label, text }) => (
                    <React.Fragment key={label}>
                        <dt>{label}</dt>
                        <dd>{text}</dd>
                    </React.Fragment>
                ))}
            </dl>
            <details className="storefront-report-details">
                <summary>Details</summary>
                {view.details.map((line) => (
                    <Text key={line} UNSAFE_className="storefront-report-detail">
                        {line}
                    </Text>
                ))}
            </details>
        </>
    );
}

/**
 * The window.
 *
 * @param props - the project's name, and how to close it or reset
 */
export function StorefrontReportModal({ projectName, onClose, onReset }: StorefrontReportModalProps): React.ReactElement {
    const { state, reload } = useStorefrontReport();
    const reset = (): void => {
        onClose();
        onReset();
    };
    return (
        <Modal title={`Storefront report: ${projectName}`} size="L" onClose={onClose} closeLabel="Close">
            {/* Reading, failed and the report are three heights: hold the tallest so far. */}
            <SteadyHeight align="start">
            {state.phase === 'loading' ? <LoadingDisplay size="L" message="Reading the storefront" /> : null}
            {state.phase === 'error' ? (
                <StatusDisplay
                    variant="error"
                    title="Couldn't read the storefront report"
                    message={state.message}
                    actions={[{ label: 'Try again', onPress: reload }]}
                />
            ) : null}
            {state.phase === 'ready' ? (
                <div className="storefront-report">
                    <SectionLabel>Needs your attention</SectionLabel>
                    <Attention view={state.view} onReset={reset} />
                    <SectionLabel>About this storefront</SectionLabel>
                    <About view={state.view} />
                </div>
            ) : null}
            </SteadyHeight>
        </Modal>
    );
}
