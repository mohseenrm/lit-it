/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var vscode = require('vscode');
var path = require('path');
var vscode_extension_telemetry_1 = require('vscode-extension-telemetry');
var telemetryReporter;
function activate(context) {
    var packageInfo = getPackageInfo(context);
    telemetryReporter = packageInfo && new vscode_extension_telemetry_1.default(packageInfo.name, packageInfo.version, packageInfo.aiKey);
    var provider = new MDDocumentContentProvider(context);
    var registration = vscode.workspace.registerTextDocumentContentProvider('markdown', provider);
    var d1 = vscode.commands.registerCommand('markdown.showPreview', showPreview);
    var d2 = vscode.commands.registerCommand('markdown.showPreviewToSide', function (uri) { return showPreview(uri, true); });
    var d3 = vscode.commands.registerCommand('markdown.showSource', showSource);
    context.subscriptions.push(d1, d2, d3, registration);
    vscode.workspace.onDidSaveTextDocument(function (document) {
        if (isMarkdownFile(document)) {
            var uri = getMarkdownUri(document.uri);
            provider.update(uri);
        }
    });
    vscode.workspace.onDidChangeTextDocument(function (event) {
        if (isMarkdownFile(event.document)) {
            var uri = getMarkdownUri(event.document.uri);
            provider.update(uri);
        }
    });
    vscode.workspace.onDidChangeConfiguration(function () {
        vscode.workspace.textDocuments.forEach(function (document) {
            if (document.uri.scheme === 'markdown') {
                // update all generated md documents
                provider.update(document.uri);
            }
        });
    });
}
exports.activate = activate;
function isMarkdownFile(document) {
    return document.languageId === 'markdown'
        && document.uri.scheme !== 'markdown'; // prevent processing of own documents
}
function getMarkdownUri(uri) {
    return uri.with({ scheme: 'markdown', path: uri.path + '.rendered', query: uri.toString() });
}
function showPreview(uri, sideBySide) {
    if (sideBySide === void 0) { sideBySide = false; }
    var resource = uri;
    if (!(resource instanceof vscode.Uri)) {
        if (vscode.window.activeTextEditor) {
            // we are relaxed and don't check for markdown files
            resource = vscode.window.activeTextEditor.document.uri;
        }
    }
    if (!(resource instanceof vscode.Uri)) {
        if (!vscode.window.activeTextEditor) {
            // this is most likely toggling the preview
            return vscode.commands.executeCommand('markdown.showSource');
        }
        // nothing found that could be shown or toggled
        return;
    }
    var thenable = vscode.commands.executeCommand('vscode.previewHtml', getMarkdownUri(resource), getViewColumn(sideBySide), "Preview '" + path.basename(resource.fsPath) + "'");
    if (telemetryReporter) {
        telemetryReporter.sendTelemetryEvent('openPreview', {
            where: sideBySide ? 'sideBySide' : 'inPlace',
            how: (uri instanceof vscode.Uri) ? 'action' : 'pallete'
        });
    }
    return thenable;
}
function getViewColumn(sideBySide) {
    var active = vscode.window.activeTextEditor;
    if (!active) {
        return vscode.ViewColumn.One;
    }
    if (!sideBySide) {
        return active.viewColumn;
    }
    switch (active.viewColumn) {
        case vscode.ViewColumn.One:
            return vscode.ViewColumn.Two;
        case vscode.ViewColumn.Two:
            return vscode.ViewColumn.Three;
    }
    return active.viewColumn;
}
function showSource(mdUri) {
    if (!mdUri) {
        return vscode.commands.executeCommand('workbench.action.navigateBack');
    }
    var docUri = vscode.Uri.parse(mdUri.query);
    for (var _i = 0, _a = vscode.window.visibleTextEditors; _i < _a.length; _i++) {
        var editor = _a[_i];
        if (editor.document.uri.toString() === docUri.toString()) {
            return vscode.window.showTextDocument(editor.document, editor.viewColumn);
        }
    }
    return vscode.workspace.openTextDocument(docUri).then(function (doc) {
        return vscode.window.showTextDocument(doc);
    });
}
function getPackageInfo(context) {
    var extensionPackage = require(context.asAbsolutePath('./package.json'));
    if (extensionPackage) {
        return {
            name: extensionPackage.name,
            version: extensionPackage.version,
            aiKey: extensionPackage.aiKey
        };
    }
    return null;
}
var MDDocumentContentProvider = (function () {
    function MDDocumentContentProvider(context) {
        this._onDidChange = new vscode.EventEmitter();
        this._context = context;
        this._waiting = false;
        this._renderer = this.createRenderer();
    }
    MDDocumentContentProvider.prototype.createRenderer = function () {
        var hljs = require('highlight.js');
        var mdnh = require('markdown-it-named-headers');
        var md = require('markdown-it')({
            html: true,
            highlight: function (str, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return "<pre class=\"hljs\"><code><div>" + hljs.highlight(lang, str, true).value + "</div></code></pre>";
                    }
                    catch (error) { }
                }
                return "<pre class=\"hljs\"><code><div>" + md.utils.escapeHtml(str) + "</div></code></pre>";
            }
        }).use(mdnh, {});
        return md;
    };
    MDDocumentContentProvider.prototype.getMediaPath = function (mediaFile) {
        return this._context.asAbsolutePath(path.join('media', mediaFile));
    };
    MDDocumentContentProvider.prototype.isAbsolute = function (p) {
        return path.normalize(p + '/') === path.normalize(path.resolve(p) + '/');
    };
    MDDocumentContentProvider.prototype.fixHref = function (resource, href) {
        if (href) {
            // Use href if it is already an URL
            if (vscode.Uri.parse(href).scheme) {
                return href;
            }
            // Use href as file URI if it is absolute
            if (this.isAbsolute(href)) {
                return vscode.Uri.file(href).toString();
            }
            // use a workspace relative path if there is a workspace
            var rootPath = vscode.workspace.rootPath;
            if (rootPath) {
                return vscode.Uri.file(path.join(rootPath, href)).toString();
            }
            // otherwise look relative to the markdown file
            return vscode.Uri.file(path.join(path.dirname(resource.fsPath), href)).toString();
        }
        return href;
    };
    MDDocumentContentProvider.prototype.computeCustomStyleSheetIncludes = function (uri) {
        var _this = this;
        var styles = vscode.workspace.getConfiguration('markdown')['styles'];
        if (styles && Array.isArray(styles) && styles.length > 0) {
            return styles.map(function (style) {
                return "<link rel=\"stylesheet\" href=\"" + _this.fixHref(uri, style) + "\" type=\"text/css\" media=\"screen\">";
            }).join('\n');
        }
        return '';
    };
    MDDocumentContentProvider.prototype.getSettingsOverrideStyles = function () {
        var previewSettings = vscode.workspace.getConfiguration('markdown')['preview'];
        if (!previewSettings) {
            return '';
        }
        var fontFamily = previewSettings.fontFamily, fontSize = previewSettings.fontSize, lineHeight = previewSettings.lineHeight;
        return [
            '<style>',
            'body {',
            fontFamily ? "font-family: " + fontFamily + ";" : '',
            +fontSize > 0 ? "font-size: " + fontSize + "px;" : '',
            +lineHeight > 0 ? "line-height: " + lineHeight + ";" : '',
            '}',
            '</style>'].join('\n');
    };
    MDDocumentContentProvider.prototype.provideTextDocumentContent = function (uri) {
        var _this = this;
        return vscode.workspace.openTextDocument(vscode.Uri.parse(uri.query)).then(function (document) {
            var scrollBeyondLastLine = vscode.workspace.getConfiguration('editor')['scrollBeyondLastLine'];
            var head = [].concat('<!DOCTYPE html>', '<html>', '<head>', '<meta http-equiv="Content-type" content="text/html;charset=UTF-8">', "<link rel=\"stylesheet\" type=\"text/css\" href=\"" + _this.getMediaPath('markdown.css') + "\" >", "<link rel=\"stylesheet\" type=\"text/css\" href=\"" + _this.getMediaPath('tomorrow.css') + "\" >", _this.getSettingsOverrideStyles(), _this.computeCustomStyleSheetIncludes(uri), "<base href=\"" + document.uri.toString(true) + "\">", '</head>', "<body class=\"" + (scrollBeyondLastLine ? 'scrollBeyondLastLine' : '') + "\">").join('\n');
            var body = _this._renderer.render(_this.getDocumentContentForPreview(document));
            var tail = [
                '</body>',
                '</html>'
            ].join('\n');
            return head + body + tail;
        });
    };
    Object.defineProperty(MDDocumentContentProvider.prototype, "onDidChange", {
        get: function () {
            return this._onDidChange.event;
        },
        enumerable: true,
        configurable: true
    });
    MDDocumentContentProvider.prototype.update = function (uri) {
        var _this = this;
        if (!this._waiting) {
            this._waiting = true;
            setTimeout(function () {
                _this._waiting = false;
                _this._onDidChange.fire(uri);
            }, 300);
        }
    };
    MDDocumentContentProvider.prototype.getDocumentContentForPreview = function (document) {
        var content = document.getText();
        var previewFrontMatter = vscode.workspace.getConfiguration('markdown')['previewFrontMatter'];
        if (previewFrontMatter === 'hide') {
            return content.replace(/^-{3}[ \t]*(\r\n|\n)(.|\r\n|\n)*?(\r\n|\n)-{3}[ \t]*(\r\n|\n)/, '');
        }
        return content;
    };
    return MDDocumentContentProvider;
}());
//# sourceMappingURL=https://ticino.blob.core.windows.net/sourcemaps/ee428b0eead68bf0fb99ab5fdc4439be227b6281/extensions/markdown/out/extension.js.map
