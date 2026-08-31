/**
 * Shared harness for the `edsPipeline` suite family.
 *
 * WHAT IS SHARED. The Helix fake, the logger, the services bundle, and the six
 * base parameters — all byte-identical across both suites, 32 lines of them.
 *
 * WHAT IS NOT, and why. Each suite supplies its own `daLiveContentOps` and
 * `githubFileOps` because their RESPONSES are the thing under test: the
 * integration suite has GitHub return no existing file, the operations suite has
 * it return one, and each drives a different set of content calls. A shared
 * default for those would be a value every test then overrode.
 *
 * The `edsHelpers` mock also stays local. The integration suite adds
 * `verifyLibraryPreviewed` — with a comment recording that omitting it let the
 * library-publish verify step throw into a swallowing catch, which is how a gap
 * hid — and the operations suite mocks a brand-asset publisher the integration
 * suite never loads.
 *
 * ABOUT THE CASTS. `EdsPipelineServices` names three whole service CLASSES with
 * about 25 methods between them, so a fake of the three or four a test drives
 * cannot satisfy it without `as unknown as`. That is ADR-016 rule 2 being
 * violated by necessity rather than by choice, and narrowing the pipeline's
 * parameter is real work that has not been done — it is the root the
 * storefrontSetup and edsReset families sit on too. Collecting the casts HERE
 * makes the cost countable: eight of them across the two suites became one per
 * collaborator, in one file, with this note attached.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

import { createMockLogger } from '../../../helpers/loggerFake';
import type { EdsPipelineParams, EdsPipelineServices } from '@/features/eds/services/edsPipeline';

export { executeEdsPipeline } from '@/features/eds/services/edsPipeline';
export type { EdsPipelineParams, EdsPipelineServices };

/** The repo/site coordinates every test in both suites starts from. */
export function basePipelineParams(): EdsPipelineParams {
    return {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-site',
        templateOwner: 'template-owner',
        templateRepo: 'template-repo',
    };
}

/** The two Helix calls the pipeline makes on the paths these suites drive. */
export function pipelineHelixFake(): EdsPipelineServices['helixService'] {
    return {
        purgeCacheAll: jest.fn().mockResolvedValue(undefined),
        publishAllSiteContent: jest.fn().mockResolvedValue(undefined),
    } as unknown as EdsPipelineServices['helixService'];
}

/** Assemble a services bundle from the parts a suite chooses to vary. */
export function pipelineServices(parts: {
    daLiveContentOps: unknown;
    githubFileOps: unknown;
    helixService?: EdsPipelineServices['helixService'];
    logger?: EdsPipelineServices['logger'];
}): EdsPipelineServices {
    return {
        daLiveContentOps: parts.daLiveContentOps as EdsPipelineServices['daLiveContentOps'],
        githubFileOps: parts.githubFileOps as EdsPipelineServices['githubFileOps'],
        helixService: parts.helixService ?? pipelineHelixFake(),
        logger: parts.logger ?? createMockLogger(),
    };
}
