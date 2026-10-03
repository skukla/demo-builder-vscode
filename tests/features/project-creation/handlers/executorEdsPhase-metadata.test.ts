/**
 * populateEdsMetadata records what the new storefront was built on (EDS-13f
 * step 01): the boilerplate in its own `package.json`, beside the template
 * record the update check already keeps. GitHub is the boundary.
 */

import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { resolveTemplateCommitSha } from '@/features/eds/services/templateCommitResolver';
import { populateEdsMetadata } from '@/features/project-creation/handlers/executorEdsPhase';
import type { Project } from '@/types/base';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/features/eds/handlers/edsServiceCache', () => ({ getGitHubServices: jest.fn() }));
jest.mock('@/features/eds/services/templateCommitResolver', () => ({ resolveTemplateCommitSha: jest.fn() }));

const getFileContent = jest.fn();

function project(): Project {
    return createMockProject({
        name: 'p',
        componentInstances: { 'eds-storefront': { id: 'eds-storefront', name: 'EDS', status: 'ready' } },
    });
}

const CONFIG: ProjectCreationConfig = {
    projectName: 'p',
    edsConfig: {
        repoName: 'bodea-demo',
        repoMode: 'new',
        repoUrl: 'https://github.com/steve/bodea-demo',
        githubOwner: 'steve',
        daLiveOrg: 'steve',
        daLiveSite: 'bodea-demo',
        templateOwner: 'adobe-commerce',
        templateRepo: 'boilerplate-b2b-template',
    },
};

function context() {
    return createMockHandlerContext({
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
        stateManager: createMockStateManager(),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    (getGitHubServices as jest.Mock).mockReturnValue({ fileOperations: { getFileContent } });
    (resolveTemplateCommitSha as jest.Mock).mockResolvedValue('a'.repeat(40));
});

describe('populateEdsMetadata — the boilerplate (EDS-13f)', () => {
    it("records the new repository's boilerplate, read from the repository itself", async () => {
        getFileContent.mockResolvedValue({
            content: JSON.stringify({ name: '@adobe/aem-boilerplate-commerce', version: '6.0.0' }),
        });
        const target = project();

        await populateEdsMetadata(context(), target, CONFIG, true);

        expect(getFileContent).toHaveBeenCalledWith('steve', 'bodea-demo', 'package.json', undefined);
        expect(target.componentInstances?.['eds-storefront']?.metadata).toMatchObject({
            githubRepo: 'steve/bodea-demo',
            boilerplate: { name: '@adobe/aem-boilerplate-commerce', version: '6.0.0' },
        });
    });

    it('records no boilerplate when it cannot be read, and still records the rest', async () => {
        getFileContent.mockRejectedValue(new Error('GitHub answered 502'));
        const target = project();

        await populateEdsMetadata(context(), target, CONFIG, true);

        const metadata = target.componentInstances?.['eds-storefront']?.metadata;
        expect(metadata).not.toHaveProperty('boilerplate');
        expect(metadata).toMatchObject({ githubRepo: 'steve/bodea-demo', templateRepo: 'boilerplate-b2b-template' });
    });
});
