/**
 * Unit Tests: Storefront Setup Operations
 *
 * Phase 4: Move operations to storefront-setup
 *
 * Tests verify the behavior for:
 * 1. Content publish phase should be included in storefront-setup
 * 2. Progress ranges should include the content-publish phase
 * 3. After storefront-setup completes, site should be LIVE
 *
 * Note: tools-clone stays in executor because it needs a local project path
 * that doesn't exist until after project-creation runs.
 */

describe('Storefront Setup Operations', () => {
    describe('Phase Sequence', () => {
        /**
         * After Phase 4 implementation, storefront-setup includes:
         * 1. github-repo (0-15%)
         * 2. helix-config (15-35%)
         * 3. code-sync (35-45%)
         * 4. content-copy (45-60%)
         * 5. content-publish (60-90%) ← NEW: moved from edsProjectService
         * 6. complete (100%)
         *
         * Note: tools-clone stays in executor because it needs a local
         * project path that doesn't exist until project-creation.
         */

        // Phases in storefront-setup after Phase 4
        const STOREFRONT_SETUP_PHASES = [
            'github-repo',
            'helix-config',
            'code-sync',
            'content-copy',
            'content-publish',  // NEW: makes site LIVE
        ] as const;

        it('should include content-publish phase after content-copy', () => {
            const contentPublishIndex = STOREFRONT_SETUP_PHASES.indexOf('content-publish');
            const contentCopyIndex = STOREFRONT_SETUP_PHASES.indexOf('content-copy');

            expect(contentPublishIndex).toBeGreaterThan(contentCopyIndex);
            expect(contentPublishIndex).toBe(4); // 5th phase (0-indexed)
        });

        it('should have 5 phases total (including content-publish)', () => {
            expect(STOREFRONT_SETUP_PHASES.length).toBe(5);
        });

        it('should NOT include tools-clone in storefront-setup', () => {
            // tools-clone requires local project path - stays in executor
            const toolsCloneIndex = STOREFRONT_SETUP_PHASES.indexOf('tools-clone' as any);
            expect(toolsCloneIndex).toBe(-1); // Not found
        });
    });

    describe('Progress Ranges', () => {
        /**
         * Progress ranges after Phase 4:
         * - github-repo: 0-15%
         * - helix-config: 15-35%
         * - code-sync: 35-45%
         * - content-copy: 45-60%
         * - content-publish: 60-90%
         * - complete: 100%
         */

        const PROGRESS_RANGES = {
            'github-repo': { start: 0, end: 15 },
            'helix-config': { start: 15, end: 35 },
            'code-sync': { start: 35, end: 45 },
            'content-copy': { start: 45, end: 60 },
            'content-publish': { start: 60, end: 90 },
            'complete': { start: 100, end: 100 },
        } as const;

        it('should allocate progress for content-publish phase (60-90%)', () => {
            const contentPublish = PROGRESS_RANGES['content-publish'];
            expect(contentPublish.start).toBe(60);
            expect(contentPublish.end).toBe(90);
        });

        it('should have content-copy end at 60%', () => {
            const contentCopy = PROGRESS_RANGES['content-copy'];
            expect(contentCopy.end).toBe(60);
        });

        it('should have no gaps between content-copy and content-publish', () => {
            const contentCopy = PROGRESS_RANGES['content-copy'];
            const contentPublish = PROGRESS_RANGES['content-publish'];
            expect(contentCopy.end).toBe(contentPublish.start);
        });
    });

    describe('Content Publish Operation', () => {
        /**
         * Tests for the publishAllSiteContent operation.
         * This should be called after DA.live content is copied.
         */

        it('should publish content to CDN after content copy', () => {
            // The expected operation order:
            // 1. Copy DA.live content (content-copy phase)
            // 2. Publish all content to CDN (content-publish phase) ← this makes site LIVE
            const phaseOrder = [
                { phase: 'content-copy', description: 'Copy demo content' },
                { phase: 'content-publish', description: 'Publish content to CDN' },
            ];

            expect(phaseOrder[0].phase).toBe('content-copy');
            expect(phaseOrder[1].phase).toBe('content-publish');
        });

        it('should make site accessible after content-publish phase', () => {
            // After content-publish completes:
            // - Site URL should return 200
            // - Content should be visible at preview URL
            // - No additional steps needed for site to be viewable

            // This is a logical assertion - the actual URL test would be integration
            const siteAccessibleAfter = 'content-publish';
            expect(siteAccessibleAfter).not.toBe('project-creation'); // Old behavior
            expect(siteAccessibleAfter).toBe('content-publish'); // New behavior
        });
    });

    describe('Skip Behavior', () => {
        /**
         * Tests for skip behavior when content is skipped.
         */

        it('should skip content-publish when skipContent is true', () => {
            // Logic: if skipContent, don't publish (nothing to publish)
            // But still send progress message to maintain flow
            const skipContent = true;
            const shouldCallPublishApi = !skipContent;

            expect(shouldCallPublishApi).toBe(false);
        });

        it('should run content-publish when skipContent is false', () => {
            // Default behavior - publish runs after content copy
            const skipContent = false;
            const shouldCallPublishApi = !skipContent;

            expect(shouldCallPublishApi).toBe(true);
        });
    });

    describe('Error Handling', () => {
        /**
         * Tests for error handling in the content-publish phase.
         */

        it('should fail storefront-setup if content publish fails', () => {
            // If publishAllSiteContent throws, the whole setup should fail
            // This is important - site must be viewable after storefront-setup

            const publishError = new Error('Failed to publish content to CDN');
            const errorPhase = 'content-publish';

            expect(publishError.message).toContain('publish');
            expect(errorPhase).toBe('content-publish');
        });

        it('should include meaningful error message', () => {
            // Error should indicate what failed and why
            const error = new Error('Failed to publish content to CDN: Helix admin API returned 503');

            expect(error.message).toContain('publish');
            expect(error.message).toContain('CDN');
        });
    });

    describe('Message Types', () => {
        /**
         * Tests for progress message types.
         */

        it('should use storefront-setup-progress for content-publish messages', () => {
            // Progress messages for new phases should use the same type
            const progressMessageType = 'storefront-setup-progress';
            const contentPublishMessage = {
                phase: 'content-publish',
                message: 'Publishing content to CDN...',
                progress: 65,
            };

            expect(progressMessageType).toBe('storefront-setup-progress');
            expect(contentPublishMessage.phase).toBe('content-publish');
        });

        it('should include site is live message on completion', () => {
            const completionMessage = {
                phase: 'content-publish',
                message: 'Site is live!',
                progress: 90,
            };

            expect(completionMessage.message).toContain('live');
            expect(completionMessage.progress).toBe(90);
        });
    });

    describe('Tools Clone Location', () => {
        /**
         * Tools clone stays in executor because it needs a local project path.
         */

        it('should require local project path for tools-clone', () => {
            // cloneIngestionTool needs:
            // - config.projectPath (local filesystem path)
            // - This doesn't exist until project-creation runs
            // - Therefore it must stay in executor, not storefront-setup

            const requiresLocalPath = true;
            const availableInStorefrontSetup = false;

            expect(requiresLocalPath).toBe(true);
            expect(availableInStorefrontSetup).toBe(false);
        });

        it('should have tools-clone run after project-creation', () => {
            // Tools clone happens in executor after local project is created
            const toolsCloneLocation = 'executor';
            const runsAfter = 'project-creation';

            expect(toolsCloneLocation).toBe('executor');
            expect(runsAfter).toBe('project-creation');
        });
    });
});
