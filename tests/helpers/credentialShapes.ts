/**
 * Build provider-shaped credential strings WITHOUT writing one into the source.
 *
 * A secret scanner matches the SHAPE, never the contents: `ghp_` followed by hex is
 * GitHub's personal-access-token format whatever the hex spells, and `PASSWORD=` beside a
 * literal is a password whatever the literal says. This repository is PUBLIC, so the bar
 * is that the shape never enters — not that it turns out to be harmless once someone reads
 * it. Two alerts on 2026-09-05 and one on 2026-09-06 were all inert fixtures; each still
 * had to be chased by hand, which is how people learn to wave alerts away.
 *
 * Assembling the shape at run time keeps the test honest — a redaction test still gets a
 * string its subject must redact — while leaving nothing in the file for a scanner to
 * match.
 *
 * JWT-shaped strings live in `./jwtFake`; this file is for the provider formats.
 * `tests/sop/no-credential-shaped-fixtures.test.ts` bans new literals and points here.
 */

/**
 * A GitHub personal access token's shape: the `ghp_` marker and 32 hex characters.
 *
 * Split so the prefix never appears beside the body in the source. The default body is
 * ascending hex — obviously synthetic to a reader, and structurally valid to the code
 * under test.
 */
export function githubTokenShape(body = '0123456789abcdef0123456789abcdef'): string {
    return ['ghp', body].join('_');
}

/**
 * A password-shaped value for tests that must prove something about the CHARACTERS in a
 * password — that a `#` mid-value is data rather than a comment, say.
 *
 * @param chars - the characters the test is actually about; they end up inside the value
 */
export function passwordShape(chars = ''): string {
    return ['not', 'a', 'real', 'one'].join('-') + chars;
}

/**
 * A URL carrying userinfo — the form `injectTokenIntoUrl` produces for a token-authenticated
 * `git push`.
 *
 * Built with `new URL` and read back, which is the form the ban names as the way through:
 * the assembled string is exactly what the subject produces, and nothing in this file
 * matches a scanner. Writing the literal is what raised the 2026-09-03 alert, on a fixture
 * whose "token" was the word gh-token.
 *
 * @param base     the plain remote, e.g. a https GitHub clone URL
 * @param user     the userinfo user — for GitHub token auth, the token itself
 * @param password the userinfo password — GitHub's is a fixed marker string
 */
export function credentialedUrlShape(base: string, user: string, password: string): string {
    const url = new URL(base);
    url.username = user;
    url.password = password;
    return url.toString();
}
