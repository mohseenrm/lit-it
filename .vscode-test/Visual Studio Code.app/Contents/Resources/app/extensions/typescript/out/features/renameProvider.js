/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var vscode_1 = require('vscode');
var TypeScriptRenameProvider = (function () {
    function TypeScriptRenameProvider(client) {
        this.tokens = [];
        this.client = client;
    }
    TypeScriptRenameProvider.prototype.provideRenameEdits = function (document, position, newName, token) {
        var _this = this;
        var filepath = this.client.asAbsolutePath(document.uri);
        if (!filepath) {
            return Promise.resolve(null);
        }
        var args = {
            file: filepath,
            line: position.line + 1,
            offset: position.character + 1,
            findInStrings: false,
            findInComments: false
        };
        if (!args.file) {
            return Promise.resolve(null);
        }
        return this.client.execute('rename', args, token).then(function (response) {
            var renameResponse = response.body;
            if (!renameResponse) {
                return Promise.resolve(null);
            }
            var renameInfo = renameResponse.info;
            var result = new vscode_1.WorkspaceEdit();
            if (!renameInfo.canRename) {
                return Promise.reject(renameInfo.localizedErrorMessage);
            }
            renameResponse.locs.forEach(function (spanGroup) {
                var resource = _this.client.asUrl(spanGroup.file);
                if (!resource) {
                    return;
                }
                spanGroup.locs.forEach(function (textSpan) {
                    result.replace(resource, new vscode_1.Range(textSpan.start.line - 1, textSpan.start.offset - 1, textSpan.end.line - 1, textSpan.end.offset - 1), newName);
                });
            });
            return result;
        }, function (err) {
            _this.client.error("'rename' request failed with error.", err);
            return null;
        });
    };
    return TypeScriptRenameProvider;
}());
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = TypeScriptRenameProvider;
//# sourceMappingURL=https://ticino.blob.core.windows.net/sourcemaps/ee428b0eead68bf0fb99ab5fdc4439be227b6281/extensions/typescript/out/features/renameProvider.js.map
