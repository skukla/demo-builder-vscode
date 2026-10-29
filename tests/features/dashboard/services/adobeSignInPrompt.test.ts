/**
 * adobeSignInPrompt — an expired Adobe sign-in PROMPTS, and opens no browser unless
 * the SC says so (owner, 2026-10-17).
 *
 * It replaces the 2026-09-20 rule that opening a dashboard never asks: the badge
 * alone ("Signed out · Sign in") was missed. It asks once per expiry, so a declined
 * prompt does not come back on every refresh, and asks again after the next expiry.
 */

import {
    adobeSignInRestored,
    askToSignInOnce,
} from '@/features/dashboard/services/adobeSignInPrompt';

beforeEach(() => adobeSignInRestored());

it('asks, and signs in only when the SC says yes', async () => {
    const signIn = jest.fn().mockResolvedValue(undefined);

    await askToSignInOnce(async () => true, signIn);

    expect(signIn).toHaveBeenCalledTimes(1);
});

it('opens nothing when the SC declines', async () => {
    const signIn = jest.fn();

    await askToSignInOnce(async () => false, signIn);

    expect(signIn).not.toHaveBeenCalled();
});

it('asks once per expiry, not on every refresh', async () => {
    const ask = jest.fn().mockResolvedValue(false);

    await askToSignInOnce(ask, jest.fn());
    await askToSignInOnce(ask, jest.fn());

    expect(ask).toHaveBeenCalledTimes(1);
});

it('asks again once a sign-in has come and gone', async () => {
    const ask = jest.fn().mockResolvedValue(false);

    await askToSignInOnce(ask, jest.fn());
    adobeSignInRestored();
    await askToSignInOnce(ask, jest.fn());

    expect(ask).toHaveBeenCalledTimes(2);
});
