/**
 * prerequisiteRenderers — decision coverage (PL-22): the message renderers.
 *
 * `renderPrerequisiteMessage` picks between four presentations in a fixed order, and
 * the two helpers under it parse a free-text message back into structured rows. These
 * assert which presentation each input reaches AND what it puts on the screen, because
 * the ordering is the part that quietly breaks.
 */

import React from 'react';
import {
    renderAioCliErrorVersions,
    renderNodeVersionSuccess,
    renderPrerequisiteMessage,
} from '@/features/prerequisites/ui/steps/hooks/prerequisiteRenderers';
import { html, makeCheck, text } from './prerequisiteRenderers.testUtils';


describe('renderNodeVersionSuccess', () => {
    it('splits a comma-separated list into one row per version', () => {
        const rows = renderNodeVersionSuccess('20.11.0 (backend), 22.1.0 (frontend)') as React.ReactNode[];
        expect(rows).toHaveLength(2);
        expect(text(rows[0])).toBe('20.11.0 (backend)');
        expect(text(rows[1])).toBe('22.1.0 (frontend)');
    });

    it('shows the version alone when no component is named', () => {
        expect(text(renderNodeVersionSuccess('20.11.0'))).toBe('20.11.0');
    });

    it('trims the whitespace either side of each entry', () => {
        const rows = renderNodeVersionSuccess('  20.11.0  ,  22.1.0  ') as React.ReactNode[];
        expect(text(rows[0])).toBe('20.11.0');
        expect(text(rows[1])).toBe('22.1.0');
    });

    it('shows an entry it cannot parse verbatim rather than dropping it', () => {
        expect(text(renderNodeVersionSuccess('v20.11.0 (backend)'))).toBe('v20.11.0 (backend)');
    });

    it('gives every row a green tick', () => {
        const rows = renderNodeVersionSuccess('20.11.0, 22.1.0') as React.ReactNode[];
        expect(html(rows[0])).toContain('class="text-green-600"');
        expect(html(rows[1])).toContain('class="text-green-600"');
    });

    it('normalises the spacing between a version and its component', () => {
        // Two spaces in, one space out: the row is rebuilt from the captured groups,
        // not echoed. An entry that failed to parse would come back verbatim.
        expect(text(renderNodeVersionSuccess('  20.11.0  (backend)  '))).toBe('20.11.0 (backend)');
    });

    it('shows an unparseable entry verbatim, trimmed', () => {
        expect(text(renderNodeVersionSuccess('  not-a-version  '))).toBe('not-a-version');
    });

    it('does not parse a version out of an entry that carries trailing text', () => {
        expect(text(renderNodeVersionSuccess('20.11.0 extra'))).toBe('20.11.0 extra');
    });

    it('renders one row for an empty message rather than none', () => {
        const rows = renderNodeVersionSuccess('') as React.ReactNode[];
        expect(rows).toHaveLength(1);
        expect(text(rows[0])).toBe('');
    });
});

describe('renderAioCliErrorVersions', () => {
    it('pulls out every Node major the message names', () => {
        const rows = renderAioCliErrorVersions(
            'Adobe I/O CLI is missing in Node 20 and Node 22',
        ) as React.ReactNode[];
        expect(rows).toHaveLength(2);
        expect(text(rows[0])).toBe('Node 20');
        expect(text(rows[1])).toBe('Node 22');
    });

    it('gives every row a red cross', () => {
        const rows = renderAioCliErrorVersions('missing in Node 20') as React.ReactNode[];
        expect(html(rows[0])).toContain('class="text-red-600"');
    });

    it('reads a major that is separated from the word Node by more than one space', () => {
        const rows = renderAioCliErrorVersions('missing in Node  20') as React.ReactNode[];
        expect(rows).toHaveLength(1);
        expect(text(rows[0])).toBe('Node  20');
    });

    it('renders nothing at all when the message names no Node version', () => {
        expect(renderAioCliErrorVersions('Adobe I/O CLI is not installed')).toBeNull();
    });

    it('renders nothing for a bare "Node" with no number after it', () => {
        expect(renderAioCliErrorVersions('missing in Node')).toBeNull();
    });
});

describe('renderPrerequisiteMessage', () => {
    it('renders one row per Node version, with its component, when a version list is present', () => {
        const rendered = renderPrerequisiteMessage(makeCheck({
            nodeVersionStatus: [
                { version: 'Node 20', component: '@adobe/aio-cli', installed: true },
                { version: 'Node 22', component: '', installed: false },
            ],
        }));

        expect(text(rendered)).toBe('Node 20 – @adobe/aio-cliNode 22');
        const markup = html(rendered);
        expect(markup).toContain('class="text-green-600"');
        expect(markup).toContain('class="text-red-600"');
    });

    it('prefers the version list over the Node.js comma-separated presentation', () => {
        const rendered = renderPrerequisiteMessage(makeCheck({
            name: 'Node.js',
            status: 'success',
            message: '20.11.0, 22.1.0',
            nodeVersionStatus: [{ version: 'Node 20', component: 'backend', installed: true }],
        }));

        expect(text(rendered)).toBe('Node 20 – backend');
    });

    it('renders Node.js success as one row per comma-separated version', () => {
        const rendered = renderPrerequisiteMessage(makeCheck({
            name: 'Node.js',
            status: 'success',
            message: '20.11.0 (backend), 22.1.0 (frontend)',
        }));

        expect(text(rendered)).toBe('20.11.0 (backend)22.1.0 (frontend)');
    });

    it('shows a single Node.js version as plain text, since there is no comma to split on', () => {
        expect(text(renderPrerequisiteMessage(makeCheck({
            name: 'Node.js', status: 'success', message: '20.11.0',
        })))).toBe('20.11.0');
    });

    it('does not use the Node.js presentation for another tool with a comma in its message', () => {
        expect(text(renderPrerequisiteMessage(makeCheck({
            name: 'Git', status: 'success', message: 'a, b',
        })))).toBe('a, b');
    });

    it('does not use the Node.js presentation for a FAILED Node.js check', () => {
        expect(text(renderPrerequisiteMessage(makeCheck({
            name: 'Node.js', status: 'error', message: '20.11.0, 22.1.0',
        })))).toBe('20.11.0, 22.1.0');
    });

    it('renders an Adobe I/O CLI failure as one row per missing Node major', () => {
        const rendered = renderPrerequisiteMessage(makeCheck({
            name: 'Adobe I/O CLI',
            status: 'error',
            message: 'Adobe I/O CLI is missing in Node 20 and Node 22',
        }));

        expect(text(rendered)).toBe('Node 20Node 22');
    });

    it('falls back to the plain message when an Adobe I/O CLI failure names no major', () => {
        expect(text(renderPrerequisiteMessage(makeCheck({
            name: 'Adobe I/O CLI',
            status: 'error',
            message: 'Node versions could not be read',
        })))).toBe('Node versions could not be read');
    });

    it('does not use the Adobe I/O CLI presentation for a message with no "Node" in it', () => {
        expect(text(renderPrerequisiteMessage(makeCheck({
            name: 'Adobe I/O CLI', status: 'error', message: 'not installed',
        })))).toBe('not installed');
    });

    it('does not use the Adobe I/O CLI presentation for another tool', () => {
        expect(text(renderPrerequisiteMessage(makeCheck({
            name: 'Git', status: 'error', message: 'missing in Node 20',
        })))).toBe('missing in Node 20');
    });

    it('does not use the Adobe I/O CLI presentation for a SUCCESSFUL check', () => {
        expect(text(renderPrerequisiteMessage(makeCheck({
            name: 'Adobe I/O CLI', status: 'success', message: 'installed in Node 20',
        })))).toBe('installed in Node 20');
    });

    it('shows the placeholder for a successful Node.js check that has no message yet', () => {
        expect(text(renderPrerequisiteMessage(makeCheck({
            name: 'Node.js', status: 'success', message: undefined,
        })))).toBe('Waiting...');
    });

    it('shows the placeholder for a failed Adobe I/O CLI check that has no message yet', () => {
        expect(text(renderPrerequisiteMessage(makeCheck({
            name: 'Adobe I/O CLI', status: 'error', message: undefined,
        })))).toBe('Waiting...');
    });

    it('styles a failure message with the error class', () => {
        expect(html(renderPrerequisiteMessage(makeCheck({ status: 'error', message: 'Not installed' }))))
            .toContain('prerequisite-message-error');
    });

    it('styles every non-failure message with the default class', () => {
        expect(html(renderPrerequisiteMessage(makeCheck({ status: 'warning', message: 'Optional' }))))
            .toContain('prerequisite-message-default');
    });

    it('shows a placeholder when a check has produced no message yet', () => {
        expect(text(renderPrerequisiteMessage(makeCheck({ status: 'pending' })))).toBe('Waiting...');
    });

    it('renders nothing once a successful check has plugin rows to show instead', () => {
        expect(renderPrerequisiteMessage(makeCheck({
            status: 'success',
            message: 'Installed',
            plugins: [{ id: 'api-mesh', name: 'API Mesh', installed: true }],
        }))).toBeNull();
    });

    it('still shows the message for a successful check whose plugin list is empty', () => {
        expect(text(renderPrerequisiteMessage(makeCheck({
            status: 'success', message: 'Installed', plugins: [],
        })))).toBe('Installed');
    });

    it('still shows the message for a FAILED check that has plugins', () => {
        expect(text(renderPrerequisiteMessage(makeCheck({
            status: 'error',
            message: 'Not installed',
            plugins: [{ id: 'api-mesh', name: 'API Mesh', installed: false }],
        })))).toBe('Not installed');
    });

    it('renders nothing when the version list is empty and a successful check has plugins', () => {
        expect(renderPrerequisiteMessage(makeCheck({
            status: 'success',
            nodeVersionStatus: [],
            plugins: [{ id: 'api-mesh', name: 'API Mesh', installed: true }],
        }))).toBeNull();
    });
});
