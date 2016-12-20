/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var vscode_1 = require('vscode');
var MAX_DECORATORS = 500;
var decorationType = {
    before: {
        contentText: ' ',
        border: 'solid 0.1em #000',
        margin: '0.1em 0.2em 0 0.2em',
        width: '0.8em',
        height: '0.8em'
    },
    dark: {
        before: {
            border: 'solid 0.1em #eee'
        }
    }
};
function activateColorDecorations(decoratorProvider, supportedLanguages) {
    var disposables = [];
    var colorsDecorationType = vscode_1.window.createTextEditorDecorationType(decorationType);
    disposables.push(colorsDecorationType);
    var pendingUpdateRequests = {};
    // we care about all visible editors
    vscode_1.window.visibleTextEditors.forEach(function (editor) {
        if (editor.document) {
            triggerUpdateDecorations(editor.document);
        }
    });
    // to get visible one has to become active
    vscode_1.window.onDidChangeActiveTextEditor(function (editor) {
        if (editor) {
            triggerUpdateDecorations(editor.document);
        }
    }, null, disposables);
    vscode_1.workspace.onDidChangeTextDocument(function (event) { return triggerUpdateDecorations(event.document); }, null, disposables);
    vscode_1.workspace.onDidOpenTextDocument(triggerUpdateDecorations, null, disposables);
    vscode_1.workspace.onDidCloseTextDocument(triggerUpdateDecorations, null, disposables);
    vscode_1.workspace.textDocuments.forEach(triggerUpdateDecorations);
    function triggerUpdateDecorations(document) {
        var triggerUpdate = supportedLanguages[document.languageId];
        var documentUri = document.uri;
        var documentUriStr = documentUri.toString();
        var timeout = pendingUpdateRequests[documentUriStr];
        if (typeof timeout !== 'undefined') {
            clearTimeout(timeout);
            triggerUpdate = true; // force update, even if languageId is not supported (anymore)
        }
        if (triggerUpdate) {
            pendingUpdateRequests[documentUriStr] = setTimeout(function () {
                // check if the document is in use by an active editor
                vscode_1.window.visibleTextEditors.forEach(function (editor) {
                    if (editor.document && documentUriStr === editor.document.uri.toString()) {
                        updateDecorationForEditor(editor, documentUriStr);
                    }
                });
                delete pendingUpdateRequests[documentUriStr];
            }, 500);
        }
    }
    function updateDecorationForEditor(editor, contentUri) {
        var document = editor.document;
        decoratorProvider(contentUri).then(function (ranges) {
            var decorations = ranges.slice(0, MAX_DECORATORS).map(function (range) {
                var color = document.getText(range);
                return {
                    range: range,
                    renderOptions: {
                        before: {
                            backgroundColor: color
                        }
                    }
                };
            });
            editor.setDecorations(colorsDecorationType, decorations);
        });
    }
    return vscode_1.Disposable.from.apply(vscode_1.Disposable, disposables);
}
exports.activateColorDecorations = activateColorDecorations;
//# sourceMappingURL=https://ticino.blob.core.windows.net/sourcemaps/ee428b0eead68bf0fb99ab5fdc4439be227b6281/extensions/html/client/out/colorDecorators.js.map
