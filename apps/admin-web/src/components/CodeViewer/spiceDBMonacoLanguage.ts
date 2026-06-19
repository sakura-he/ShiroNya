import * as monaco from "monaco-editor/esm/vs/editor/editor.api";

export const SPICEDB_LANGUAGE_ID = "spicedb";

let spicedbLanguageRegistered = false;

/**
 * 注册 SpiceDB schema 的 Monaco 语言定义，让 schema 预览具备基础语法高亮。
 */
export function registerSpiceDBMonacoLanguage() {
    if (spicedbLanguageRegistered) {
        return;
    }

    const existingLanguage = monaco.languages
        .getLanguages()
        .some((language) => language.id === SPICEDB_LANGUAGE_ID);

    if (!existingLanguage) {
        monaco.languages.register({
            id: SPICEDB_LANGUAGE_ID,
            aliases: ["SpiceDB Schema", "Zed"],
            extensions: [".zed"],
        });
    }

    monaco.languages.setLanguageConfiguration(SPICEDB_LANGUAGE_ID, {
        comments: {
            lineComment: "//",
            blockComment: ["/*", "*/"],
        },
        brackets: [
            ["{", "}"],
            ["[", "]"],
            ["(", ")"],
        ],
        autoClosingPairs: [
            { open: "{", close: "}" },
            { open: "[", close: "]" },
            { open: "(", close: ")" },
            { open: '"', close: '"' },
            { open: "'", close: "'" },
        ],
        surroundingPairs: [
            { open: "{", close: "}" },
            { open: "[", close: "]" },
            { open: "(", close: ")" },
            { open: '"', close: '"' },
            { open: "'", close: "'" },
        ],
    });

    monaco.languages.setMonarchTokensProvider(SPICEDB_LANGUAGE_ID, {
        keywords: ["definition", "relation", "permission", "caveat", "use", "expiration"],
        builtins: ["true", "false", "null"],
        types: [
            "any",
            "bool",
            "bytes",
            "double",
            "duration",
            "int",
            "ipaddress",
            "list",
            "map",
            "string",
            "timestamp",
            "uint",
        ],
        operators: [
            "=",
            "+",
            "&",
            "-",
            "->",
            ".",
            ":",
            "#",
            "@",
            "|",
            "!",
            "&&",
            "||",
            "==",
            "!=",
            "<",
            "<=",
            ">",
            ">=",
        ],
        symbols: /[=><!~?:&|+\-*\/^%#@.]+/,
        tokenizer: {
            root: [
                [/\/\/.*$/, "comment"],
                [/\/\*/, "comment", "@comment"],
                [/(definition)(\s+)([A-Za-z_][\w/-]*)/, ["keyword", "", "type"]],
                [/(relation)(\s+)([A-Za-z_][\w-]*)/, ["keyword", "", "variable"]],
                [/(permission)(\s+)([A-Za-z_][\w-]*)/, ["keyword", "", "function"]],
                [/(caveat)(\s+)([A-Za-z_][\w-]*)/, ["keyword", "", "function"]],
                [
                    /[A-Za-z_][\w/-]*/,
                    {
                        cases: {
                            "@keywords": "keyword",
                            "@types": "type",
                            "@builtins": "constant",
                            "@default": "identifier",
                        },
                    },
                ],
                [/\d+(\.\d+)?([eE][+-]?\d+)?/, "number"],
                [/[{}()[\]]/, "@brackets"],
                [/[;,.]/, "delimiter"],
                [/@symbols/, { cases: { "@operators": "operator", "@default": "delimiter" } }],
                [/"([^"\\]|\\.)*$/, "string.invalid"],
                [/"/, "string", "@stringDouble"],
                [/'([^'\\]|\\.)*$/, "string.invalid"],
                [/'/, "string", "@stringSingle"],
                [/\s+/, "white"],
            ],
            comment: [
                [/[^/*]+/, "comment"],
                [/\*\//, "comment", "@pop"],
                [/[/*]/, "comment"],
            ],
            stringDouble: [
                [/[^\\"]+/, "string"],
                [/\\./, "string.escape"],
                [/"/, "string", "@pop"],
            ],
            stringSingle: [
                [/[^\\']+/, "string"],
                [/\\./, "string.escape"],
                [/'/, "string", "@pop"],
            ],
        },
    });

    spicedbLanguageRegistered = true;
}
