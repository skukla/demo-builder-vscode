/**
 * PrerequisitesStep — decision coverage (PL-22): the plugin-detail block.
 *
 * No suite in this family delivered a status carrying `plugins`, so the whole block
 * that renders plugin rows — including the single-plugin form that lists the Node
 * versions the tool is installed for — had no test go near it.
 */

import { screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    renderLoadedStep,
    resetAllMocks,
    setupScrollMock,
} from './PrerequisitesStep.testUtils';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: unknown[]) => {
            const { mockPostMessage } = require('./PrerequisitesStep.testUtils');
            return mockPostMessage(...args);
        },
        onMessage: (...args: unknown[]) => {
            const { mockOnMessage } = require('./PrerequisitesStep.testUtils');
            return mockOnMessage(...args);
        },
    },
}));

const AIO = [{ id: 0, name: 'Adobe I/O CLI', description: 'Adobe CLI', optional: false }];

/**
 * The text of every PLUGIN row on screen, in order.
 *
 * Node-version rows carry the same small icon, so they are excluded by where they
 * live: those sit inside `.prerequisite-message`, the plugin rows do not.
 */
function pluginRows(): string[] {
    return Array.from(document.querySelectorAll('svg[data-size="XS"]'))
        .map((svg) => svg.parentElement)
        .filter((row): row is HTMLElement => !!row && !row.closest('.prerequisite-message'))
        .map((row) => row.textContent?.replace(/DefaultIcon/g, '') ?? '');
}

beforeAll(() => setupScrollMock());
beforeEach(() => resetAllMocks());

describe('the plugin rows a per-node-version tool shows', () => {
    it('lists the single plugin with the Node versions the tool is installed for', async () => {
        const fire = await renderLoadedStep(AIO, 'Adobe I/O CLI');

        fire.fireStatus({
            index: 0,
            name: 'Adobe I/O CLI',
            status: 'success',
            description: 'Adobe CLI',
            required: true,
            installed: true,
            message: 'Installed for versions:',
            nodeVersionStatus: [
                { version: 'Node 18', component: '10.0.0', installed: true },
                { version: 'Node 20', component: '10.0.0', installed: true },
            ],
            plugins: [{ id: 'api-mesh', name: 'API Mesh Plugin', installed: true }],
        });

        await waitFor(() => screen.getByText(/API Mesh Plugin/));
        expect(pluginRows()).toEqual(['API Mesh Plugin (Node 18, Node 20)']);
    });

    it('omits the bracket entirely when the version list is empty', async () => {
        const fire = await renderLoadedStep(AIO, 'Adobe I/O CLI');

        fire.fireStatus({
            index: 0,
            name: 'Adobe I/O CLI',
            status: 'checking',
            description: 'Adobe CLI',
            required: true,
            nodeVersionStatus: [],
            plugins: [{ id: 'api-mesh', name: 'API Mesh Plugin', installed: undefined }],
        });

        await waitFor(() => screen.getByText(/API Mesh Plugin/));
        expect(pluginRows()).toEqual(['API Mesh Plugin']);
    });

    it('lists each plugin WITHOUT versions when there is more than one', async () => {
        const fire = await renderLoadedStep(AIO, 'Adobe I/O CLI');

        fire.fireStatus({
            index: 0,
            name: 'Adobe I/O CLI',
            status: 'success',
            description: 'Adobe CLI',
            required: true,
            installed: true,
            nodeVersionStatus: [{ version: 'Node 18', component: '10.0.0', installed: true }],
            plugins: [
                { id: 'api-mesh', name: 'API Mesh Plugin', installed: true },
                { id: 'app-builder', name: 'App Builder Plugin', installed: false },
            ],
        });

        await waitFor(() => screen.getByText(/API Mesh Plugin/));
        expect(pluginRows()).toEqual(['API Mesh Plugin', 'App Builder Plugin']);
    });

    it('lists a single plugin without versions when the tool is not per-node-version', async () => {
        const fire = await renderLoadedStep(AIO, 'Adobe I/O CLI');

        fire.fireStatus({
            index: 0,
            name: 'Adobe I/O CLI',
            status: 'success',
            description: 'Adobe CLI',
            required: true,
            installed: true,
            plugins: [{ id: 'api-mesh', name: 'API Mesh Plugin', installed: true }],
        });

        await waitFor(() => screen.getByText(/API Mesh Plugin/));
        expect(pluginRows()).toEqual(['API Mesh Plugin']);
    });

    /**
     * The backend has, at times, appended its own ✓/✗ to a plugin name. Both rendering
     * branches strip a mark at the END and must leave one in the middle alone — the
     * anchors and the whitespace quantifiers are what make that true.
     */
    const MARKS: [string, string][] = [
        ['API Mesh Plugin ✓', 'API Mesh Plugin'],
        ['API Mesh Plugin  ✓ ', 'API Mesh Plugin'],
        ['API ✓ Mesh Plugin', 'API ✓ Mesh Plugin'],
        ['API Mesh Plugin ✗', 'API Mesh Plugin'],
        ['API Mesh Plugin  ✗ ', 'API Mesh Plugin'],
        ['API ✗ Mesh Plugin', 'API ✗ Mesh Plugin'],
    ];

    it.each(MARKS)('renders %p as %p on the single per-node-version row', async (name, shown) => {
        const fire = await renderLoadedStep(AIO, 'Adobe I/O CLI');

        fire.fireStatus({
            index: 0, name: 'Adobe I/O CLI', status: 'success', description: 'Adobe CLI',
            required: true, installed: true,
            nodeVersionStatus: [{ version: 'Node 18', component: '10.0.0', installed: true }],
            plugins: [{ id: 'api-mesh', name, installed: true }],
        });

        await waitFor(() => screen.getByText(/Mesh Plugin/));
        expect(pluginRows()).toEqual([`${shown} (Node 18)`]);
    });

    it.each(MARKS)('renders %p as %p on a plain plugin row', async (name, shown) => {
        const fire = await renderLoadedStep(AIO, 'Adobe I/O CLI');

        fire.fireStatus({
            index: 0, name: 'Adobe I/O CLI', status: 'success', description: 'Adobe CLI',
            required: true, installed: true,
            plugins: [{ id: 'api-mesh', name, installed: true }],
        });

        await waitFor(() => screen.getByText(/Mesh Plugin/));
        expect(pluginRows()).toEqual([shown]);
    });

    it('shows no plugin rows at all when the status carries an empty plugin list', async () => {
        const fire = await renderLoadedStep(AIO, 'Adobe I/O CLI');

        fire.fireStatus({
            index: 0,
            name: 'Adobe I/O CLI',
            status: 'success',
            description: 'Adobe CLI',
            required: true,
            installed: true,
            message: 'Adobe I/O CLI is installed',
            plugins: [],
        });

        await waitFor(() => screen.getByText('Adobe I/O CLI is installed'));
        expect(pluginRows()).toEqual([]);
        // Not merely empty — absent. An empty container still adds its top margin.
        expect(document.querySelectorAll('.prerequisite-expandable [data-testid="spectrum-view"]'))
            .toHaveLength(0);
    });

    it('hides the plugin rows while any Node version is still missing the tool', async () => {
        const fire = await renderLoadedStep(AIO, 'Adobe I/O CLI');

        fire.fireStatus({
            index: 0,
            name: 'Adobe I/O CLI',
            status: 'success',
            description: 'Adobe CLI',
            required: true,
            installed: false,
            nodeVersionStatus: [
                { version: 'Node 18', component: '10.0.0', installed: true },
                { version: 'Node 20', component: '', installed: false },
            ],
            plugins: [{ id: 'api-mesh', name: 'API Mesh Plugin', installed: true }],
        });

        await waitFor(() => screen.getByText('Node 20'));
        expect(screen.queryByText(/API Mesh Plugin/)).not.toBeInTheDocument();
    });

    it('styles the plugin row differently once the check has succeeded', async () => {
        const fire = await renderLoadedStep(AIO, 'Adobe I/O CLI');

        fire.fireStatus({
            index: 0, name: 'Adobe I/O CLI', status: 'success', description: 'Adobe CLI',
            required: true, installed: true,
            plugins: [{ id: 'api-mesh', name: 'API Mesh Plugin', installed: true }],
        });

        await waitFor(() => screen.getByText('API Mesh Plugin'));
        expect(screen.getByText('API Mesh Plugin')).toHaveClass('text-sm');
        expect(screen.getByText('API Mesh Plugin')).not.toHaveClass('prerequisite-plugin-item');
    });

    it('styles the plugin row as in-progress while the check is still running', async () => {
        const fire = await renderLoadedStep(AIO, 'Adobe I/O CLI');

        fire.fireStatus({
            index: 0, name: 'Adobe I/O CLI', status: 'checking', description: 'Adobe CLI',
            required: true,
            plugins: [{ id: 'api-mesh', name: 'API Mesh Plugin', installed: undefined }],
        });

        await waitFor(() => screen.getByText('API Mesh Plugin'));
        expect(screen.getByText('API Mesh Plugin')).toHaveClass('prerequisite-plugin-item');
    });

    it('styles the single per-node-version row as done once the check has succeeded', async () => {
        const fire = await renderLoadedStep(AIO, 'Adobe I/O CLI');

        fire.fireStatus({
            index: 0, name: 'Adobe I/O CLI', status: 'success', description: 'Adobe CLI',
            required: true, installed: true,
            nodeVersionStatus: [{ version: 'Node 18', component: '10.0.0', installed: true }],
            plugins: [{ id: 'api-mesh', name: 'API Mesh Plugin', installed: true }],
        });

        await waitFor(() => screen.getByText(/API Mesh Plugin/));
        expect(screen.getByText(/API Mesh Plugin/)).toHaveClass('text-sm');
        expect(screen.getByText(/API Mesh Plugin/)).not.toHaveClass('prerequisite-plugin-item');
    });

    it('styles the single per-node-version row by the same rule', async () => {
        const fire = await renderLoadedStep(AIO, 'Adobe I/O CLI');

        fire.fireStatus({
            index: 0, name: 'Adobe I/O CLI', status: 'checking', description: 'Adobe CLI',
            required: true,
            nodeVersionStatus: [{ version: 'Node 18', component: '10.0.0', installed: true }],
            plugins: [{ id: 'api-mesh', name: 'API Mesh Plugin', installed: undefined }],
        });

        await waitFor(() => screen.getByText(/API Mesh Plugin/));
        expect(screen.getByText(/API Mesh Plugin/)).toHaveClass('prerequisite-plugin-item');
    });
});
