/**
 * The wizard's `edsConfig` string fields, never undefined.
 *
 * WHY THIS EXISTS, and why it is not cosmetic. These six fields feed controlled
 * inputs. React silently switches an input to UNCONTROLLED the moment its value
 * becomes `undefined` — discarding whatever the user had typed, with no error in
 * the console and no failing test. Anything writing a partial `edsConfig` back
 * into wizard state has to re-assert them.
 *
 * It was written once, correctly, inside `RepoSelectionInline.tsx`, and
 * hand-rolled at three other sites that had no idea the reasoning existed. This
 * is the shared copy; the docstring is the part worth sharing.
 */

import type { BaseStepProps } from '@/types/wizard';

/** The wizard's edsConfig, exactly as state carries it (optional included). */
export type WizardEdsConfig = BaseStepProps['state']['edsConfig'];

/** The six string fields, with `''` standing in for any absent value. */
export interface EdsConfigStringDefaults {
    accsHost: string;
    storeViewCode: string;
    customerGroup: string;
    repoName: string;
    daLiveOrg: string;
    daLiveSite: string;
}

export function edsConfigStringDefaults(edsConfig: WizardEdsConfig): EdsConfigStringDefaults {
    return {
        accsHost: edsConfig?.accsHost || '',
        storeViewCode: edsConfig?.storeViewCode || '',
        customerGroup: edsConfig?.customerGroup || '',
        repoName: edsConfig?.repoName || '',
        daLiveOrg: edsConfig?.daLiveOrg || '',
        daLiveSite: edsConfig?.daLiveSite || '',
    };
}
