/**
 * Field Validation Tests - Project Name
 *
 * Tests for validateProjectNameUI, which composes required + alphanumeric +
 * maxLength(50) and maps the result to a UI-facing {isValid, message}.
 *
 * The cases are DATA. Every one of these rows was its own `it` block asserting
 * the identical pair of expectations against a different input, which is what
 * 39 tests against 21 mutable decisions looks like. Adding a case is now one
 * line, and each row still reports as its own named test, so a failure names
 * the input that broke rather than the group.
 *
 * Each row asserts the WHOLE result object rather than `isValid` and `message`
 * separately — a full-object assertion cannot pass while the other field
 * quietly changes.
 */

import { validateProjectNameUI } from '@/core/validation/fieldValidation';

const REQUIRED = 'Project name is required';
const CHARSET = 'Project name can only contain letters, numbers, hyphens, and underscores';
const TOO_LONG = 'Project name must be 50 characters or less';

const ACCEPTED: ReadonlyArray<readonly [string, string]> = [
    ['a plain lowercase name', 'myproject'],
    ['hyphens', 'my-awesome-project'],
    ['underscores', 'my_project_2024'],
    ['hyphens and underscores together', 'project-123_test'],
    ['uppercase letters', 'MyProject'],
    ['digits only', '12345'],
    ['a single character', 'a'],
    ['exactly 50 characters — the boundary', 'a'.repeat(50)],
];

const BLANK: ReadonlyArray<readonly [string, string]> = [
    ['an empty string', ''],
    ['spaces only', '   '],
    ['tabs only', '\t\t\t'],
    ['newlines only', '\n\n'],
];

/**
 * Everything the character rule rejects. The security-flavoured groupings the
 * original suite used — XSS, command injection, path traversal — are preserved
 * as labels because they record WHY the input is worth testing, but they all
 * exercise one rule and produce one message.
 */
const REJECTED_CHARACTERS: ReadonlyArray<readonly [string, string]> = [
    ['a space inside the name', 'my project'],
    ['leading and trailing spaces', '  project  '],
    ['an exclamation mark', 'project!'],
    ['an at sign', 'project@'],
    ['a hash', 'project#'],
    ['a dollar sign', 'project$'],
    ['a percent sign', 'project%'],
    ['a caret', 'project^'],
    ['an ampersand', 'project&'],
    ['an asterisk', 'project*'],
    ['an opening parenthesis', 'project('],
    ['a closing parenthesis', 'project)'],
    ['an equals sign', 'project='],
    ['a plus sign', 'project+'],
    ['a dot', 'my.project'],
    ['a forward slash', 'my/project'],
    ['a backslash', 'my\\project'],
    ['a question mark', 'project?'],
    ['angle brackets', '<project>'],
    ['double quotes', '"project"'],
    ['an HTML tag (XSS)', '<script>alert("xss")</script>'],
    ['HTML entities (XSS)', 'test&lt;script&gt;'],
    ['a javascript: URL (XSS)', 'javascript:alert(1)'],
    ['a semicolon (command injection)', 'project; rm -rf /'],
    ['a pipe (command injection)', 'project | cat /etc/passwd'],
    ['a shell substitution (command injection)', 'project$(whoami)'],
    ['backticks (command injection)', 'project`whoami`'],
    ['a parent directory reference (path traversal)', '../etc/passwd'],
    ['an absolute path (path traversal)', '/etc/passwd'],
    ['an emoji', 'project😀'],
    ['an accented character', 'projéct'],
    ['cyrillic characters', 'проект'],
    ['chinese characters', '项目'],
    ['a null byte', 'project\x00test'],
    ['a CRLF sequence', 'project\r\ntest'],
];

const TOO_LONG_NAMES: ReadonlyArray<readonly [string, string]> = [
    ['51 characters — one past the boundary', 'a'.repeat(51)],
    ['100 characters', 'a'.repeat(100)],
];

describe('validateProjectNameUI', () => {
    it.each(ACCEPTED)('accepts %s', (_label, value) => {
        expect(validateProjectNameUI(value)).toEqual({ isValid: true, message: '' });
    });

    // `required` runs first and trims, so a blank name never reaches the
    // character rule — the message proves WHICH validator rejected it.
    it.each(BLANK)('rejects %s as missing', (_label, value) => {
        expect(validateProjectNameUI(value)).toEqual({ isValid: false, message: REQUIRED });
    });

    it.each(REJECTED_CHARACTERS)('rejects %s', (_label, value) => {
        expect(validateProjectNameUI(value)).toEqual({ isValid: false, message: CHARSET });
    });

    // Length is checked LAST, so an over-long name made of legal characters
    // reports the length message rather than the character one.
    it.each(TOO_LONG_NAMES)('rejects %s', (_label, value) => {
        expect(validateProjectNameUI(value)).toEqual({ isValid: false, message: TOO_LONG });
    });

    // The composition order itself, which no single-input case above can show:
    // an over-long name that ALSO breaks the character rule reports the
    // character message, because `alphanumeric` is composed before `maxLength`.
    it('reports the character rule, not the length rule, when a long name breaks both', () => {
        expect(validateProjectNameUI(`${'a'.repeat(60)} b`)).toEqual({
            isValid: false,
            message: CHARSET,
        });
    });
});
