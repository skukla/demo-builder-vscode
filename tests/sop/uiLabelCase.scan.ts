/**
 * The reader behind `ui-label-case.test.ts`: every string in a position that NAMES something, read
 * with the TypeScript compiler rather than a regex, because most of them are not at the site. A title
 * is often a constant in another file, a function on a copy object, or one side of a conditional.
 *
 * It follows those through the checker. What it still cannot read (a value from props, a value made
 * at runtime) comes back as a dynamic site, so an unread string is counted rather than passed.
 */

import * as path from 'path';
import * as ts from 'typescript';

/** One string in a naming position, or one the scan could not read. */
export interface LabelSite {
    file: string;
    line: number;
    /** Which position: `Modal.title`, `<Button>`, `actionButton.label`. */
    position: string;
    /** The text, with `${}` where a value goes. Absent for a dynamic site. */
    text?: string;
}

/** JSX attributes that name something, by component. */
const NAMING_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
    Modal: ['title', 'closeLabel'],
    PageHeader: ['title'],
    ConfirmActionDialog: ['title', 'actionLabel'],
    FormDialog: ['title', 'submitLabel'],
    ProgressDialog: ['title'],
    ResultDialog: ['title'],
    GuideDialog: ['title'],
    FormField: ['label'],
    TextField: ['label'],
    TextArea: ['label'],
    Picker: ['label'],
    ComboBox: ['label'],
    NumberField: ['label'],
    CheckboxRow: ['label'],
    PanelRow: ['label'],
    ChoiceCard: ['name'],
    OptionalNameField: ['fieldLabel'],
};

/** Components whose own text is a name. */
const NAMING_TEXT = new Set(['Button', 'button', 'ActionButton', 'Link', 'MenuItem', 'Tab', 'Heading', 'SectionLabel', 'Checkbox', 'Radio', 'Switch']);

/** A small label by class, for the labels drawn as a plain element. */
const LABEL_CLASS = 'datapack-import-label';

/** Keys that, on an object also carrying `failureTitle`, are the titles of a run. */
const RUN_TITLES = new Set(['title', 'failureTitle', 'successTitle']);

const MAX_FOLLOW = 5;

function propertyNameOf(node: ts.ObjectLiteralElementLike): string {
    return node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) ? node.name.text : '';
}

/** Whether an object literal is a button or a menu row: a `label` with what acts on it. */
function isActionObject(object: ts.ObjectLiteralExpression): boolean {
    const keys = object.properties.map(propertyNameOf);
    return keys.includes('label') && (keys.includes('onPress') || keys.includes('variant') || keys.includes('icon'));
}

/** What a function body returns, leaving out the functions nested inside it. */
function returnsOf(body: ts.Block): ts.Expression[] {
    const values: ts.Expression[] = [];
    const walk = (node: ts.Node): void => {
        if (ts.isFunctionLike(node)) return;
        if (ts.isReturnStatement(node) && node.expression) values.push(node.expression);
        ts.forEachChild(node, walk);
    };
    ts.forEachChild(body, walk);
    return values;
}

class Reader {
    constructor(private readonly checker: ts.TypeChecker) {}

    /** Every string this expression can be, or null where one of them cannot be read. */
    read(node: ts.Expression, depth = 0): Array<string | null> {
        if (depth > MAX_FOLLOW) return [null];
        if (ts.isStringLiteralLike(node)) return [node.text];
        if (ts.isTemplateExpression(node)) {
            return [[node.head.text, ...node.templateSpans.map((span) => `\${}${span.literal.text}`)].join('')];
        }
        if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
            return this.read(node.expression, depth);
        }
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return [];
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return this.read(node.right, depth);
        if (ts.isConditionalExpression(node)) {
            return [...this.read(node.whenTrue, depth), ...this.read(node.whenFalse, depth)];
        }
        if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
            return [...this.read(node.left, depth), ...this.read(node.right, depth)];
        }
        if (node.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isIdentifier(node) && node.text === 'undefined')) return [];
        if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) return this.followSymbol(node, depth);
        if (ts.isCallExpression(node)) return this.followCall(node, depth);
        if (ts.isElementAccessExpression(node)) return this.followTable(node, depth);
        return [null];
    }

    private initializerOf(node: ts.Expression): ts.Expression | undefined {
        const shorthand = ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent);
        let symbol = shorthand ? this.checker.getShorthandAssignmentValueSymbol(node.parent) : this.checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node) ? node.name : node);
        if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
        const declaration = symbol?.valueDeclaration;
        if (!declaration) return undefined;
        if (ts.isVariableDeclaration(declaration) || ts.isPropertyAssignment(declaration)) return declaration.initializer;
        return undefined;
    }

    private followSymbol(node: ts.Expression, depth: number): Array<string | null> {
        const initializer = this.initializerOf(node);
        return initializer ? this.read(initializer, depth + 1) : [null];
    }

    /** Every value of a constant table: `TITLES[mode]` can be any of them. */
    private followTable(node: ts.ElementAccessExpression, depth: number): Array<string | null> {
        const table = this.initializerOf(node.expression);
        if (!table || !ts.isObjectLiteralExpression(table)) return [null];
        return table.properties.flatMap((property) => (ts.isPropertyAssignment(property) ? this.read(property.initializer, depth + 1) : [null]));
    }

    /** A function in this code: what each of its returns can be. */
    private followCall(node: ts.CallExpression, depth: number): Array<string | null> {
        const body = this.bodyOf(node.expression);
        if (!body) return [null];
        if (!ts.isBlock(body)) return this.read(body, depth + 1);
        const returned = returnsOf(body);
        return returned.length > 0 ? returned.flatMap((value) => this.read(value, depth + 1)) : [null];
    }

    private bodyOf(callee: ts.Expression): ts.ConciseBody | undefined {
        let symbol = this.checker.getSymbolAtLocation(ts.isPropertyAccessExpression(callee) ? callee.name : callee);
        if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
        const declaration = symbol?.valueDeclaration;
        if (declaration && ts.isFunctionDeclaration(declaration)) return declaration.body;
        const initializer = declaration && (ts.isVariableDeclaration(declaration) || ts.isPropertyAssignment(declaration)) ? declaration.initializer : undefined;
        return initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) ? initializer.body : undefined;
    }
}

function jsxName(tag: ts.JsxTagNameExpression): string {
    return tag.getText();
}

function hasLabelClass(attributes: ts.JsxAttributes): boolean {
    return attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.getText().includes(LABEL_CLASS));
}

/**
 * What an element's children say. A lone expression is read through to its strings, since
 * `<Button>{label}</Button>` is usually a constant or a conditional; beside text it is a value, `${}`.
 * Icons beside the words are not part of them. Empty when the children hold other elements with text.
 */
function childTexts(element: ts.JsxElement, reader: Reader): Array<string | null> {
    const parts: string[] = [];
    const expressions: ts.Expression[] = [];
    let hasWords = false;
    for (const child of element.children) {
        if (ts.isJsxText(child)) {
            parts.push(child.getText());
            hasWords = hasWords || child.getText().trim() !== '';
        } else if (ts.isJsxExpression(child)) {
            if (child.expression) expressions.push(child.expression);
            parts.push(child.expression ? '${}' : '');
        } else if (!ts.isJsxSelfClosingElement(child)) return [];
    }
    if (!hasWords && expressions.length === 1) return reader.read(expressions[0]);
    const text = parts.join('').replace(/\s+/g, ' ').replace(/&apos;|&rsquo;/g, "'").trim();
    return text ? [text] : [];
}

/** The nearest element around this node, through the conditionals and expressions between them. */
function enclosingElement(node: ts.Node): ts.JsxElement | undefined {
    let parent = node.parent;
    while (parent && (ts.isJsxExpression(parent) || ts.isConditionalExpression(parent) || ts.isParenthesizedExpression(parent) || ts.isBinaryExpression(parent))) {
        parent = parent.parent;
    }
    return parent && ts.isJsxElement(parent) ? parent : undefined;
}

/** The name of the nearest element around this one that gives its text a name, `Text` being transparent. */
function textOwner(element: ts.JsxElement): string | undefined {
    const own = jsxName(element.openingElement.tagName);
    if (NAMING_TEXT.has(own)) return own;
    if (hasLabelClass(element.openingElement.attributes)) return LABEL_CLASS;
    if (own === 'Text') {
        const parent = enclosingElement(element);
        if (parent && NAMING_TEXT.has(jsxName(parent.openingElement.tagName))) return jsxName(parent.openingElement.tagName);
    }
    return undefined;
}

/** Every naming site in these source files. */
export function scanSources(sources: readonly ts.SourceFile[], checker: ts.TypeChecker, root: string): LabelSite[] {
    const reader = new Reader(checker);
    const sites: LabelSite[] = [];
    for (const source of sources) {
        const file = path.relative(root, source.fileName);
        const add = (node: ts.Node, position: string, values: ReadonlyArray<string | null>): void => {
            const { line } = source.getLineAndCharacterOfPosition(node.getStart());
            for (const text of values) sites.push({ file, line: line + 1, position, ...(text === null ? {} : { text }) });
        };
        const visit = (node: ts.Node): void => {
            if (ts.isJsxOpeningLikeElement(node)) {
                const tag = jsxName(node.tagName);
                const wanted = NAMING_ATTRIBUTES[tag] ?? [];
                for (const attribute of node.attributes.properties) {
                    if (!ts.isJsxAttribute(attribute) || !attribute.initializer) continue;
                    const name = attribute.name.getText();
                    if (!wanted.includes(name) && name !== 'closeLabel') continue;
                    const init = attribute.initializer;
                    if (ts.isStringLiteral(init)) add(init, `${tag}.${name}`, [init.text]);
                    else if (ts.isJsxExpression(init) && init.expression) add(init, `${tag}.${name}`, reader.read(init.expression));
                }
            }
            if (ts.isJsxElement(node)) {
                const owner = textOwner(node);
                if (owner) add(node, `<${owner}>`, childTexts(node, reader));
            }
            if (ts.isObjectLiteralExpression(node)) {
                const keys = node.properties.map(propertyNameOf);
                const action = isActionObject(node);
                const run = keys.includes('failureTitle');
                for (const property of node.properties) {
                    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
                    const key = propertyNameOf(property);
                    const isNaming = (action && key === 'label') || (run && RUN_TITLES.has(key)) || key === 'closeLabel';
                    if (isNaming) add(property, `object.${key}`, reader.read(ts.isPropertyAssignment(property) ? property.initializer : property.name));
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
    return sites;
}

/** Words Title Case keeps small unless first or last. */
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with', 'nor', 'via', 'per', 'vs']);

/** A word with no case of its own to get wrong: an identifier, a file, a number, a domain. */
const isIdentifierLike = (word: string): boolean => /[_./]|^\d|[A-Z]/.test(word.slice(1)) || /^\d/.test(word);

/**
 * Whether a name is Title Case: every word capitalised, bar small words in the middle and words that
 * are identifiers. `${}` stands for a value and counts as a word, so `Remove ${}?` is fine and a small
 * word before it stays small.
 *
 * @returns the first word that breaks it, or undefined
 */
export function firstNonTitleWord(text: string): string | undefined {
    const words = text.split(/\s+/).filter((word) => /[A-Za-z0-9$]/.test(word));
    for (const [index, raw] of words.entries()) {
        if (raw.includes('${}')) continue;
        const word = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
        if (!word) continue;
        const afterColon = index > 0 && words[index - 1].endsWith(':');
        const edge = index === 0 || index === words.length - 1 || afterColon;
        if (!edge && SMALL_WORDS.has(word)) continue;
        if (isIdentifierLike(word)) continue;
        if (word.split('-').some((part) => part && /^[a-z]/.test(part))) return word;
    }
    return undefined;
}

/** The compiler over one in-memory file: the suite's own planted defects go through the real reader. */
export function scanPlanted(sourceText: string): LabelSite[] {
    const name = '/planted.tsx';
    const options: ts.CompilerOptions = { jsx: ts.JsxEmit.Preserve, noLib: true, target: ts.ScriptTarget.ES2020, noResolve: true };
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersion) =>
        fileName === name ? ts.createSourceFile(name, sourceText, languageVersion, true, ts.ScriptKind.TSX) : original(fileName, languageVersion);
    const program = ts.createProgram([name], options, host);
    return scanSources([program.getSourceFile(name) as ts.SourceFile], program.getTypeChecker(), '/');
}
