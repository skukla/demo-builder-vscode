/**
 * Shared set-up for the datapack file handler suites (`datapackZipHandlers.test.ts`, and Keep Both's,
 * step-07 F1): the access guard mocked so a suite hands back its own client, the store's HTTP as a
 * fetch fake that records each write, a temp project, and a datapack file written into it.
 *
 * Owns the handlers' import (webview-test-authoring §3, the same hoisting rule for any suite): the
 * guard's mock registers before the handlers bind to it. Specs import the handlers from here.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/dataInstallerHandlers'),
    resolveDataInstallerAccess: jest.fn(),
}));

// Below the mock on purpose: it hoists above these imports.
import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { buildDatapackZip, type DatapackFile } from '@/features/data-installer/services/datapackZip';
import type { Project } from '@/types/base';

export {
    datapackZipHandlers,
    INSTALLER_UPDATE_REFUSED,
    installerEchoRefusal,
    KEEP_BOTH_LIBRARY_ONLY,
    KEEP_BOTH_NAMES_UNREAD,
} from '@/features/data-installer/handlers/datapackZipHandlers';

export const mockAccess = resolveDataInstallerAccess as jest.Mock;

/** A temp folder for the project, real on disk. */
export function tempProject(prefix: string): string {
    return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

/** The store's HTTP: every write answered 201, and recorded. */
export function storeFetch(): jest.Mock {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 201, text: async () => '{"success":true}' }));
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
}

/** A handler context with this project open, from the panel or from an agent. */
export function contextFor(project: Project | null, withPanel = false) {
    const context = createMockHandlerContext(withPanel ? { panel: createMockWebviewPanel() } : {});
    (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(project);
    return context;
}

/** The pack written as a datapack file in the folder. */
export function zipFile(dir: string, pack: DatapackFile, name = 'pack.datapack.zip'): string {
    const file = path.join(dir, name);
    fs.writeFileSync(file, buildDatapackZip(pack));
    return file;
}
