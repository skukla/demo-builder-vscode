/**
 * Default template-sync strategy for a project.
 *
 * Content forks reset to the master: their content lives in DA.live/AEM (not the
 * repo) and the wiring files (config.json/fstab.yaml) are preserved, so a reset is
 * non-destructive and keeps the fork aligned. Commerce/legacy projects keep the
 * existing 'merge' default (merge with reset-fallback).
 */

import type { Project } from '@/types/base';
import { isContentFlow } from '@/types/typeGuards';

export function defaultSyncStrategyForProject(project: Project | undefined | null): 'merge' | 'reset' {
    return isContentFlow(project ?? {}) ? 'reset' : 'merge';
}
