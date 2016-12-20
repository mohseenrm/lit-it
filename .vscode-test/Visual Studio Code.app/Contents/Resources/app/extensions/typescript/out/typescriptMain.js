/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* --------------------------------------------------------------------------------------------
 * Includes code from typescript-sublime-plugin project, obtained from
 * https://github.com/Microsoft/TypeScript-Sublime-Plugin/blob/master/TypeScript%20Indent.tmPreferences
 * ------------------------------------------------------------------------------------------ */
'use strict';
var vscode_1 = require('vscode');
// This must be the first statement otherwise modules might got loaded with
// the wrong locale.
var nls = require('vscode-nls');
nls.config({ locale: vscode_1.env.language });
var path = require('path');
var typescriptServiceClient_1 = require('./typescriptServiceClient');
var hoverProvider_1 = require('./features/hoverProvider');
var definitionProvider_1 = require('./features/definitionProvider');
var documentHighlightProvider_1 = require('./features/documentHighlightProvider');
var referenceProvider_1 = require('./features/referenceProvider');
var documentSymbolProvider_1 = require('./features/documentSymbolProvider');
var signatureHelpProvider_1 = require('./features/signatureHelpProvider');
var renameProvider_1 = require('./features/renameProvider');
var formattingProvider_1 = require('./features/formattingProvider');
var bufferSyncSupport_1 = require('./features/bufferSyncSupport');
var completionItemProvider_1 = require('./features/completionItemProvider');
var workspaceSymbolProvider_1 = require('./features/workspaceSymbolProvider');
var VersionStatus = require('./utils/versionStatus');
var ProjectStatus = require('./utils/projectStatus');
var BuildStatus = require('./utils/buildStatus');
function activate(context) {
    var MODE_ID_TS = 'typescript';
    var MODE_ID_TSX = 'typescriptreact';
    var MODE_ID_JS = 'javascript';
    var MODE_ID_JSX = 'javascriptreact';
    var clientHost = new TypeScriptServiceClientHost([
        {
            id: 'typescript',
            diagnosticSource: 'ts',
            modeIds: [MODE_ID_TS, MODE_ID_TSX],
            extensions: ['.ts', '.tsx'],
            configFile: 'tsconfig.json'
        },
        {
            id: 'javascript',
            diagnosticSource: 'js',
            modeIds: [MODE_ID_JS, MODE_ID_JSX],
            extensions: ['.js', '.jsx'],
            configFile: 'jsconfig.json'
        }
    ], context.storagePath, context.globalState);
    var client = clientHost.serviceClient;
    context.subscriptions.push(vscode_1.commands.registerCommand('typescript.reloadProjects', function () {
        clientHost.reloadProjects();
    }));
    context.subscriptions.push(vscode_1.commands.registerCommand('javascript.reloadProjects', function () {
        clientHost.reloadProjects();
    }));
    vscode_1.window.onDidChangeActiveTextEditor(VersionStatus.showHideStatus, null, context.subscriptions);
    client.onReady().then(function () {
        context.subscriptions.push(ProjectStatus.create(client, function (path) { return new Promise(function (resolve) { return setTimeout(function () { return resolve(clientHost.handles(path)); }, 750); }); }, context.workspaceState));
    }, function () {
        // Nothing to do here. The client did show a message;
    });
    BuildStatus.update({ queueLength: 0 });
}
exports.activate = activate;
var validateSetting = 'validate.enable';
var LanguageProvider = (function () {
    function LanguageProvider(client, description) {
        var _this = this;
        this.description = description;
        this.extensions = Object.create(null);
        description.extensions.forEach(function (extension) { return _this.extensions[extension] = true; });
        this._validate = true;
        this.bufferSyncSupport = new bufferSyncSupport_1.default(client, description.modeIds, {
            delete: function (file) {
                _this.currentDiagnostics.delete(vscode_1.Uri.file(file));
            }
        }, this.extensions);
        this.syntaxDiagnostics = Object.create(null);
        this.currentDiagnostics = vscode_1.languages.createDiagnosticCollection(description.id);
        vscode_1.workspace.onDidChangeConfiguration(this.configurationChanged, this);
        this.configurationChanged();
        client.onReady().then(function () {
            _this.registerProviders(client);
            _this.bufferSyncSupport.listen();
        }, function () {
            // Nothing to do here. The client did show a message;
        });
    }
    LanguageProvider.prototype.registerProviders = function (client) {
        var _this = this;
        var config = vscode_1.workspace.getConfiguration(this.id);
        this.completionItemProvider = new completionItemProvider_1.default(client);
        this.completionItemProvider.updateConfiguration(config);
        var hoverProvider = new hoverProvider_1.default(client);
        var definitionProvider = new definitionProvider_1.default(client);
        var documentHighlightProvider = new documentHighlightProvider_1.default(client);
        var referenceProvider = new referenceProvider_1.default(client);
        var documentSymbolProvider = new documentSymbolProvider_1.default(client);
        var signatureHelpProvider = new signatureHelpProvider_1.default(client);
        var renameProvider = new renameProvider_1.default(client);
        this.formattingProvider = new formattingProvider_1.default(client);
        this.formattingProvider.updateConfiguration(config);
        if (this.formattingProvider.isEnabled()) {
            this.formattingProviderRegistration = vscode_1.languages.registerDocumentRangeFormattingEditProvider(this.description.modeIds, this.formattingProvider);
        }
        this.description.modeIds.forEach(function (modeId) {
            var selector = { scheme: 'file', language: modeId };
            vscode_1.languages.registerCompletionItemProvider(selector, _this.completionItemProvider, '.');
            vscode_1.languages.registerHoverProvider(selector, hoverProvider);
            vscode_1.languages.registerDefinitionProvider(selector, definitionProvider);
            vscode_1.languages.registerDocumentHighlightProvider(selector, documentHighlightProvider);
            vscode_1.languages.registerReferenceProvider(selector, referenceProvider);
            vscode_1.languages.registerDocumentSymbolProvider(selector, documentSymbolProvider);
            vscode_1.languages.registerSignatureHelpProvider(selector, signatureHelpProvider, '(', ',');
            vscode_1.languages.registerRenameProvider(selector, renameProvider);
            vscode_1.languages.registerOnTypeFormattingEditProvider(selector, _this.formattingProvider, ';', '}', '\n');
            vscode_1.languages.registerWorkspaceSymbolProvider(new workspaceSymbolProvider_1.default(client, modeId));
            vscode_1.languages.setLanguageConfiguration(modeId, {
                indentationRules: {
                    // ^(.*\*/)?\s*\}.*$
                    decreaseIndentPattern: /^(.*\*\/)?\s*\}.*$/,
                    // ^.*\{[^}"']*$
                    increaseIndentPattern: /^.*\{[^}"']*$/
                },
                wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
                onEnterRules: [
                    {
                        // e.g. /** | */
                        beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
                        afterText: /^\s*\*\/$/,
                        action: { indentAction: vscode_1.IndentAction.IndentOutdent, appendText: ' * ' }
                    },
                    {
                        // e.g. /** ...|
                        beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
                        action: { indentAction: vscode_1.IndentAction.None, appendText: ' * ' }
                    },
                    {
                        // e.g.  * ...|
                        beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
                        action: { indentAction: vscode_1.IndentAction.None, appendText: '* ' }
                    },
                    {
                        // e.g.  */|
                        beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
                        action: { indentAction: vscode_1.IndentAction.None, removeText: 1 }
                    },
                    {
                        // e.g.  *-----*/|
                        beforeText: /^(\t|(\ \ ))*\ \*[^/]*\*\/\s*$/,
                        action: { indentAction: vscode_1.IndentAction.None, removeText: 1 }
                    }
                ]
            });
        });
    };
    LanguageProvider.prototype.configurationChanged = function () {
        var config = vscode_1.workspace.getConfiguration(this.id);
        this.updateValidate(config.get(validateSetting, true));
        if (this.completionItemProvider) {
            this.completionItemProvider.updateConfiguration(config);
        }
        if (this.formattingProvider) {
            this.formattingProvider.updateConfiguration(config);
            if (!this.formattingProvider.isEnabled() && this.formattingProviderRegistration) {
                this.formattingProviderRegistration.dispose();
                this.formattingProviderRegistration = null;
            }
            else if (this.formattingProvider.isEnabled() && !this.formattingProviderRegistration) {
                this.formattingProviderRegistration = vscode_1.languages.registerDocumentRangeFormattingEditProvider(this.description.modeIds, this.formattingProvider);
            }
        }
    };
    LanguageProvider.prototype.handles = function (file) {
        var extension = path.extname(file);
        if ((extension && this.extensions[extension]) || this.bufferSyncSupport.handles(file)) {
            return true;
        }
        var basename = path.basename(file);
        return !!basename && basename === this.description.configFile;
    };
    Object.defineProperty(LanguageProvider.prototype, "id", {
        get: function () {
            return this.description.id;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(LanguageProvider.prototype, "diagnosticSource", {
        get: function () {
            return this.description.diagnosticSource;
        },
        enumerable: true,
        configurable: true
    });
    LanguageProvider.prototype.updateValidate = function (value) {
        if (this._validate === value) {
            return;
        }
        this._validate = value;
        this.bufferSyncSupport.validate = value;
        if (value) {
            this.triggerAllDiagnostics();
        }
        else {
            this.syntaxDiagnostics = Object.create(null);
            this.currentDiagnostics.clear();
        }
    };
    LanguageProvider.prototype.reInitialize = function () {
        this.currentDiagnostics.clear();
        this.syntaxDiagnostics = Object.create(null);
        this.bufferSyncSupport.reOpenDocuments();
        this.bufferSyncSupport.requestAllDiagnostics();
    };
    LanguageProvider.prototype.triggerAllDiagnostics = function () {
        this.bufferSyncSupport.requestAllDiagnostics();
    };
    LanguageProvider.prototype.syntaxDiagnosticsReceived = function (file, diagnostics) {
        this.syntaxDiagnostics[file] = diagnostics;
    };
    LanguageProvider.prototype.semanticDiagnosticsReceived = function (file, diagnostics) {
        var syntaxMarkers = this.syntaxDiagnostics[file];
        if (syntaxMarkers) {
            delete this.syntaxDiagnostics[file];
            diagnostics = syntaxMarkers.concat(diagnostics);
        }
        this.currentDiagnostics.set(vscode_1.Uri.file(file), diagnostics);
    };
    LanguageProvider.prototype.configFileDiagnosticsReceived = function (file, diagnostics) {
        this.currentDiagnostics.set(vscode_1.Uri.file(file), diagnostics);
    };
    return LanguageProvider;
}());
var TypeScriptServiceClientHost = (function () {
    function TypeScriptServiceClientHost(descriptions, storagePath, globalState) {
        var _this = this;
        var handleProjectCreateOrDelete = function () {
            _this.client.execute('reloadProjects', null, false);
            _this.triggerAllDiagnostics();
        };
        var handleProjectChange = function () {
            setTimeout(function () {
                _this.triggerAllDiagnostics();
            }, 1500);
        };
        var watcher = vscode_1.workspace.createFileSystemWatcher('**/[tj]sconfig.json');
        watcher.onDidCreate(handleProjectCreateOrDelete);
        watcher.onDidDelete(handleProjectCreateOrDelete);
        watcher.onDidChange(handleProjectChange);
        this.client = new typescriptServiceClient_1.default(this, storagePath, globalState);
        this.languages = [];
        this.languagePerId = Object.create(null);
        descriptions.forEach(function (description) {
            var manager = new LanguageProvider(_this.client, description);
            _this.languages.push(manager);
            _this.languagePerId[description.id] = manager;
        });
    }
    Object.defineProperty(TypeScriptServiceClientHost.prototype, "serviceClient", {
        get: function () {
            return this.client;
        },
        enumerable: true,
        configurable: true
    });
    TypeScriptServiceClientHost.prototype.reloadProjects = function () {
        this.client.execute('reloadProjects', null, false);
        this.triggerAllDiagnostics();
    };
    TypeScriptServiceClientHost.prototype.handles = function (file) {
        return !!this.findLanguage(file);
    };
    TypeScriptServiceClientHost.prototype.findLanguage = function (file) {
        for (var i = 0; i < this.languages.length; i++) {
            var language = this.languages[i];
            if (language.handles(file)) {
                return language;
            }
        }
        return null;
    };
    TypeScriptServiceClientHost.prototype.triggerAllDiagnostics = function () {
        var _this = this;
        Object.keys(this.languagePerId).forEach(function (key) { return _this.languagePerId[key].triggerAllDiagnostics(); });
    };
    /* internal */ TypeScriptServiceClientHost.prototype.populateService = function () {
        var _this = this;
        // See https://github.com/Microsoft/TypeScript/issues/5530
        vscode_1.workspace.saveAll(false).then(function (value) {
            Object.keys(_this.languagePerId).forEach(function (key) { return _this.languagePerId[key].reInitialize(); });
        });
    };
    /* internal */ TypeScriptServiceClientHost.prototype.syntaxDiagnosticsReceived = function (event) {
        var body = event.body;
        if (body && body.diagnostics) {
            var language = this.findLanguage(body.file);
            if (language) {
                language.syntaxDiagnosticsReceived(body.file, this.createMarkerDatas(body.diagnostics, language.diagnosticSource));
            }
        }
    };
    /* internal */ TypeScriptServiceClientHost.prototype.semanticDiagnosticsReceived = function (event) {
        var body = event.body;
        if (body && body.diagnostics) {
            var language = this.findLanguage(body.file);
            if (language) {
                language.semanticDiagnosticsReceived(body.file, this.createMarkerDatas(body.diagnostics, language.diagnosticSource));
            }
        }
        /*
        if (Is.defined(body.queueLength)) {
            BuildStatus.update({ queueLength: body.queueLength });
        }
        */
    };
    /* internal */ TypeScriptServiceClientHost.prototype.configFileDiagnosticsReceived = function (event) {
        // See https://github.com/Microsoft/TypeScript/issues/10384
        /* https://github.com/Microsoft/TypeScript/issues/10473
        const body = event.body;
        if (body.diagnostics) {
            const language = body.triggerFile ? this.findLanguage(body.triggerFile) : this.findLanguage(body.configFile);
            if (language) {
                if (body.diagnostics.length === 0) {
                    language.configFileDiagnosticsReceived(body.configFile, []);
                } else if (body.diagnostics.length >= 1) {
                    workspace.openTextDocument(Uri.file(body.configFile)).then((document) => {
                        let curly: [number, number, number] = undefined;
                        let nonCurly: [number, number, number] = undefined;
                        let diagnostic: Diagnostic;
                        for (let index = 0; index < document.lineCount; index++) {
                            let line = document.lineAt(index);
                            let text = line.text;
                            let firstNonWhitespaceCharacterIndex = line.firstNonWhitespaceCharacterIndex;
                            if (firstNonWhitespaceCharacterIndex < text.length) {
                                if (text.charAt(firstNonWhitespaceCharacterIndex) === '{') {
                                    curly = [index, firstNonWhitespaceCharacterIndex, firstNonWhitespaceCharacterIndex + 1];
                                    break;
                                } else {
                                    let matches = /\s*([^\s]*)(?:\s*|$)/.exec(text.substr(firstNonWhitespaceCharacterIndex));
                                    if (matches.length >= 1) {
                                        nonCurly = [index, firstNonWhitespaceCharacterIndex, firstNonWhitespaceCharacterIndex + matches[1].length];
                                    }
                                }
                            }
                        }
                        let match = curly || nonCurly;
                        if (match) {
                            diagnostic = new Diagnostic(new Range(match[0], match[1], match[0], match[2]), body.diagnostics[0].text);
                        } else {
                            diagnostic = new Diagnostic(new Range(0,0,0,0), body.diagnostics[0].text);
                        }
                        if (diagnostic) {
                            diagnostic.source = language.diagnosticSource;
                            language.configFileDiagnosticsReceived(body.configFile, [diagnostic]);
                        }
                    }, (error) => {
                        language.configFileDiagnosticsReceived(body.configFile, [new Diagnostic(new Range(0,0,0,0), body.diagnostics[0].text)]);
                    });
                }
            }
        }
        */
    };
    TypeScriptServiceClientHost.prototype.createMarkerDatas = function (diagnostics, source) {
        var result = [];
        for (var _i = 0, diagnostics_1 = diagnostics; _i < diagnostics_1.length; _i++) {
            var diagnostic = diagnostics_1[_i];
            var start = diagnostic.start, end = diagnostic.end, text = diagnostic.text;
            var range = new vscode_1.Range(start.line - 1, start.offset - 1, end.line - 1, end.offset - 1);
            var converted = new vscode_1.Diagnostic(range, text);
            converted.source = source;
            result.push(converted);
        }
        return result;
    };
    return TypeScriptServiceClientHost;
}());
//# sourceMappingURL=https://ticino.blob.core.windows.net/sourcemaps/ee428b0eead68bf0fb99ab5fdc4439be227b6281/extensions/typescript/out/typescriptMain.js.map
