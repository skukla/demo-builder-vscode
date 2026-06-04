/**
 * releaseTrack Test Suite
 *
 * Pure classifier helpers that decide which GitHub releases a given update
 * channel will install. These functions fix the "newest prerelease wins" bug
 * by classifying releases into tracks (stable / beta / early-access / other)
 * and filtering per channel.
 *
 * No I/O — no vscode/timeout/fetch mocks required.
 */

import {
    classifyTrack,
    channelAcceptsTrack,
    selectLatestForChannel,
} from '@/features/updates/services/releaseTrack';
import type { GitHubRelease } from '@/features/updates/services/types';

/** Minimal GitHubRelease factory for these pure tests. */
function release(tag_name: string, draft = false): GitHubRelease {
    return {
        tag_name,
        name: tag_name,
        body: '',
        draft,
        prerelease: /-/.test(tag_name),
        published_at: '2024-01-01T00:00:00Z',
        zipball_url: '',
        tarball_url: '',
        assets: [],
    };
}

describe('releaseTrack', () => {
    describe('classifyTrack', () => {
        it('classifies a final tag (with v) as stable', () => {
            expect(classifyTrack('v2.0.0')).toBe('stable');
        });

        it('classifies a final tag (no v) as stable', () => {
            expect(classifyTrack('2.0.0')).toBe('stable');
        });

        it('classifies a -beta.* tag as beta', () => {
            expect(classifyTrack('v1.8.0-beta.2')).toBe('beta');
        });

        it('classifies a -alpha.* tag as early-access', () => {
            expect(classifyTrack('v2.0.0-alpha.1')).toBe('early-access');
        });

        it('classifies an unknown prerelease id (rc) as other', () => {
            expect(classifyTrack('v2.0.0-rc.1')).toBe('other');
        });

        it('classifies garbage as other without throwing', () => {
            expect(() => classifyTrack('invalid-version')).not.toThrow();
            expect(classifyTrack('invalid-version')).toBe('other');
        });
    });

    describe('channelAcceptsTrack', () => {
        it('stable accepts only stable', () => {
            expect(channelAcceptsTrack('stable', 'stable')).toBe(true);
            expect(channelAcceptsTrack('stable', 'beta')).toBe(false);
            expect(channelAcceptsTrack('stable', 'early-access')).toBe(false);
            expect(channelAcceptsTrack('stable', 'other')).toBe(false);
        });

        it('beta accepts stable and beta but REJECTS early-access (bug fix)', () => {
            expect(channelAcceptsTrack('beta', 'stable')).toBe(true);
            expect(channelAcceptsTrack('beta', 'beta')).toBe(true);
            expect(channelAcceptsTrack('beta', 'early-access')).toBe(false);
            expect(channelAcceptsTrack('beta', 'other')).toBe(false);
        });

        it('early-access accepts only early-access', () => {
            expect(channelAcceptsTrack('early-access', 'early-access')).toBe(true);
            expect(channelAcceptsTrack('early-access', 'stable')).toBe(false);
            expect(channelAcceptsTrack('early-access', 'beta')).toBe(false);
            expect(channelAcceptsTrack('early-access', 'other')).toBe(false);
        });
    });

    describe('selectLatestForChannel', () => {
        const mixed = [
            release('v1.1.0'),
            release('v1.2.0-beta.1'),
            release('v2.0.0-alpha.1'),
        ];

        it('stable picks the latest final', () => {
            expect(selectLatestForChannel(mixed, 'stable')?.tag_name).toBe('v1.1.0');
        });

        it('beta picks the beta, NOT the higher-semver alpha (core bug fix)', () => {
            expect(selectLatestForChannel(mixed, 'beta')?.tag_name).toBe('v1.2.0-beta.1');
        });

        it('early-access picks the alpha', () => {
            expect(selectLatestForChannel(mixed, 'early-access')?.tag_name).toBe('v2.0.0-alpha.1');
        });

        it('picks the highest semver within the alpha track', () => {
            const alphas = [release('v2.0.0-alpha.1'), release('v2.0.0-alpha.5')];
            expect(selectLatestForChannel(alphas, 'early-access')?.tag_name).toBe('v2.0.0-alpha.5');
        });

        it('never selects a draft release', () => {
            const withDraft = [release('v2.0.0-alpha.9', true), release('v2.0.0-alpha.1')];
            expect(selectLatestForChannel(withDraft, 'early-access')?.tag_name).toBe('v2.0.0-alpha.1');
        });

        it('returns null when the channel has no eligible release', () => {
            const finalsOnly = [release('v1.1.0'), release('v1.2.0')];
            expect(selectLatestForChannel(finalsOnly, 'early-access')).toBeNull();
        });

        it('returns null for an empty array', () => {
            expect(selectLatestForChannel([], 'beta')).toBeNull();
        });
    });
});
