/**
 * What the two private-pack suites share (owner, 2026-10-30): a project whose recorded pack is in
 * the library, under the projects folder (the projects list's Export checks a path is inside it).
 */

import * as os from 'os';
import * as path from 'path';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

export const LIBRARY_PACK = { name: 'acme-1a2b3c', version: '20261029-183005', store: 'library' as const };

export function libraryPackProject(): Project {
    return createMockProject({ name: 'acme', path: path.join(os.homedir(), '.demo-builder', 'projects', 'acme'), datapack: LIBRARY_PACK });
}
