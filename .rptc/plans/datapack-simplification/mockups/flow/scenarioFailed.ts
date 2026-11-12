/**
 * J6's data: a datapack whose install failed when the project was created, shown as integration
 * cards show a failed deploy (overview.md Phase 5): the shared error dot and a label from the status
 * vocabulary, the reason in the flyout, Retry while a retry can get past the stop, then Fix with AI
 * (the import window's rule, `RETRIES_BEFORE_FIX`). The run is J2's install run over My Luma, so a
 * retry reads as the install did.
 */

import { DEMO_PACK, PACKS, type RunPlan } from './scenarioInstall';
import { RETRIES_BEFORE_FIX } from '@/features/data-installer/ui/components/importResult';

/** How a retry ends, as the panel's "Retry ends (J6)" select picks it. */
export type RetryEnding = 'fails' | 'succeeds';

/** The status label: the plan's new `statusVocabulary.ts` entry, sentence case as the table writes it. */
export const INSTALL_FAILED = 'Install failed';

/** The dashboard's Datapacks line while the install has failed (Phase 5: `LinkedSection.tsx`'s form). */

/** Retry while fewer retries than this have failed; Fix with AI after (the import window's rule). */
export const RETRIES = RETRIES_BEFORE_FIX;

/** Whether the failed state's one action is still Retry, after `retries` retries that did not help. */
export const canRetry = (retries: number): boolean => retries < RETRIES;

/** One retry of the install: My Luma, nothing saved first, stopping where the first try stopped or not. */
export const retryPlan = (ending: RetryEnding): RunPlan => ({ pack: PACKS[DEMO_PACK], saves: false, ending: ending === 'fails' ? 'stopped' : 'clean' });
