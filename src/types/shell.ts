/**
 * Shell Configuration
 *
 * Default shell for command execution.
 * Created to support prerequisite refactoring work.
 */

import * as os from 'os';

/**
 * Get default shell for the current platform
 */
export const DEFAULT_SHELL = os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash';
