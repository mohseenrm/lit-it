/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var vscode_1 = require('vscode');
var Configuration;
(function (Configuration) {
    Configuration.insertSpaceAfterCommaDelimiter = 'insertSpaceAfterCommaDelimiter';
    Configuration.insertSpaceAfterSemicolonInForStatements = 'insertSpaceAfterSemicolonInForStatements';
    Configuration.insertSpaceBeforeAndAfterBinaryOperators = 'insertSpaceBeforeAndAfterBinaryOperators';
    Configuration.insertSpaceAfterKeywordsInControlFlowStatements = 'insertSpaceAfterKeywordsInControlFlowStatements';
    Configuration.insertSpaceAfterFunctionKeywordForAnonymousFunctions = 'insertSpaceAfterFunctionKeywordForAnonymousFunctions';
    Configuration.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis = 'insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis';
    Configuration.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets = 'insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets';
    Configuration.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces = 'insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces';
    Configuration.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces = 'insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces';
    Configuration.placeOpenBraceOnNewLineForFunctions = 'placeOpenBraceOnNewLineForFunctions';
    Configuration.placeOpenBraceOnNewLineForControlBlocks = 'placeOpenBraceOnNewLineForControlBlocks';
    function equals(a, b) {
        var keys = Object.keys(a);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (a[key] !== b[key]) {
                return false;
            }
        }
        return true;
    }
    Configuration.equals = equals;
    function def() {
        var result = Object.create(null);
        result.enable = true;
        result.insertSpaceAfterCommaDelimiter = true;
        result.insertSpaceAfterSemicolonInForStatements = true;
        result.insertSpaceBeforeAndAfterBinaryOperators = true;
        result.insertSpaceAfterKeywordsInControlFlowStatements = true;
        result.insertSpaceAfterFunctionKeywordForAnonymousFunctions = false;
        result.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis = false;
        result.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets = false;
        result.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces = false;
        result.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces = false;
        result.placeOpenBraceOnNewLineForFunctions = false;
        result.placeOpenBraceOnNewLineForControlBlocks = false;
        return result;
    }
    Configuration.def = def;
})(Configuration || (Configuration = {}));
var TypeScriptFormattingProvider = (function () {
    function TypeScriptFormattingProvider(client) {
        var _this = this;
        this.client = client;
        this.config = Configuration.def();
        this.formatOptions = Object.create(null);
        vscode_1.workspace.onDidCloseTextDocument(function (textDocument) {
            var key = textDocument.uri.toString();
            // When a document gets closed delete the cached formatting options.
            // This is necessary sine the tsserver now closed a project when its
            // last file in it closes which drops the stored formatting options
            // as well.
            delete _this.formatOptions[key];
        });
    }
    TypeScriptFormattingProvider.prototype.updateConfiguration = function (config) {
        var newConfig = config.get('format', Configuration.def());
        if (!Configuration.equals(this.config, newConfig)) {
            this.config = newConfig;
            this.formatOptions = Object.create(null);
        }
    };
    TypeScriptFormattingProvider.prototype.isEnabled = function () {
        return this.config.enable;
    };
    TypeScriptFormattingProvider.prototype.ensureFormatOptions = function (document, options, token) {
        var _this = this;
        var key = document.uri.toString();
        var currentOptions = this.formatOptions[key];
        if (currentOptions && currentOptions.tabSize === options.tabSize && currentOptions.indentSize === options.tabSize && currentOptions.convertTabsToSpaces === options.insertSpaces) {
            return Promise.resolve(currentOptions);
        }
        else {
            var absPath = this.client.asAbsolutePath(document.uri);
            if (!absPath) {
                return Promise.resolve(Object.create(null));
            }
            var args_1 = {
                file: absPath,
                formatOptions: this.getFormatOptions(options)
            };
            return this.client.execute('configure', args_1, token).then(function (response) {
                _this.formatOptions[key] = args_1.formatOptions;
                return args_1.formatOptions;
            });
        }
    };
    TypeScriptFormattingProvider.prototype.doFormat = function (document, options, args, token) {
        var _this = this;
        return this.ensureFormatOptions(document, options, token).then(function () {
            return _this.client.execute('format', args, token).then(function (response) {
                if (response.body) {
                    return response.body.map(_this.codeEdit2SingleEditOperation);
                }
                else {
                    return [];
                }
            }, function (err) {
                _this.client.error("'format' request failed with error.", err);
                return [];
            });
        });
    };
    TypeScriptFormattingProvider.prototype.provideDocumentRangeFormattingEdits = function (document, range, options, token) {
        var absPath = this.client.asAbsolutePath(document.uri);
        if (!absPath) {
            return Promise.resolve([]);
        }
        var args = {
            file: absPath,
            line: range.start.line + 1,
            offset: range.start.character + 1,
            endLine: range.end.line + 1,
            endOffset: range.end.character + 1
        };
        return this.doFormat(document, options, args, token);
    };
    TypeScriptFormattingProvider.prototype.provideOnTypeFormattingEdits = function (document, position, ch, options, token) {
        var _this = this;
        var filepath = this.client.asAbsolutePath(document.uri);
        if (!filepath) {
            return Promise.resolve([]);
        }
        var args = {
            file: filepath,
            line: position.line + 1,
            offset: position.character + 1,
            key: ch
        };
        return this.ensureFormatOptions(document, options, token).then(function () {
            return _this.client.execute('formatonkey', args, token).then(function (response) {
                var edits = response.body;
                var result = [];
                if (!edits) {
                    return result;
                }
                for (var _i = 0, edits_1 = edits; _i < edits_1.length; _i++) {
                    var edit = edits_1[_i];
                    var textEdit = _this.codeEdit2SingleEditOperation(edit);
                    var range = textEdit.range;
                    // Work around for https://github.com/Microsoft/TypeScript/issues/6700.
                    // Check if we have an edit at the beginning of the line which only removes white spaces and leaves
                    // an empty line. Drop those edits
                    if (range.start.character === 0 && range.start.line === range.end.line && textEdit.newText === '') {
                        var lText = document.lineAt(range.start.line).text;
                        // If the edit leaves something on the line keep the edit (note that the end character is exclusive).
                        // Keep it also if it removes something else than whitespace
                        if (lText.trim().length > 0 || lText.length > range.end.character) {
                            result.push(textEdit);
                        }
                    }
                    else {
                        result.push(textEdit);
                    }
                }
                return result;
            }, function (err) {
                _this.client.error("'formatonkey' request failed with error.", err);
                return [];
            });
        });
    };
    TypeScriptFormattingProvider.prototype.codeEdit2SingleEditOperation = function (edit) {
        return new vscode_1.TextEdit(new vscode_1.Range(edit.start.line - 1, edit.start.offset - 1, edit.end.line - 1, edit.end.offset - 1), edit.newText);
    };
    TypeScriptFormattingProvider.prototype.getFormatOptions = function (options) {
        return {
            tabSize: options.tabSize,
            indentSize: options.tabSize,
            convertTabsToSpaces: options.insertSpaces,
            // We can use \n here since the editor normalizes later on to its line endings.
            newLineCharacter: '\n',
            insertSpaceAfterCommaDelimiter: this.config.insertSpaceAfterCommaDelimiter,
            insertSpaceAfterSemicolonInForStatements: this.config.insertSpaceAfterSemicolonInForStatements,
            insertSpaceBeforeAndAfterBinaryOperators: this.config.insertSpaceBeforeAndAfterBinaryOperators,
            insertSpaceAfterKeywordsInControlFlowStatements: this.config.insertSpaceAfterKeywordsInControlFlowStatements,
            insertSpaceAfterFunctionKeywordForAnonymousFunctions: this.config.insertSpaceAfterFunctionKeywordForAnonymousFunctions,
            insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: this.config.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis,
            insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: this.config.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets,
            insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: this.config.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces,
            insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: this.config.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces,
            placeOpenBraceOnNewLineForFunctions: this.config.placeOpenBraceOnNewLineForFunctions,
            placeOpenBraceOnNewLineForControlBlocks: this.config.placeOpenBraceOnNewLineForControlBlocks
        };
    };
    return TypeScriptFormattingProvider;
}());
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = TypeScriptFormattingProvider;
//# sourceMappingURL=https://ticino.blob.core.windows.net/sourcemaps/ee428b0eead68bf0fb99ab5fdc4439be227b6281/extensions/typescript/out/features/formattingProvider.js.map
