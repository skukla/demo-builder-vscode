/**
 * The platform default shell for command execution.
 *
 * Lived in `src/types/shell.ts` until 2026-08-31, which made that file the only
 * thing keeping a runtime import in the types tree — `os.platform()` is a call,
 * not a type. The file was fourteen lines and held nothing else, so it was a
 * constants module misfiled rather than a types module with a problem.
 *
 * It belongs beside the command executor that consumes it.
 *
 * @module core/shell/defaultShell
 */

import * as os from 'os';

/** `cmd.exe` on Windows, `/bin/bash` everywhere else. */
export const DEFAULT_SHELL = os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash';
