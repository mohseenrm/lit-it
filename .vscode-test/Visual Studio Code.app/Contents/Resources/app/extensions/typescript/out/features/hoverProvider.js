/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var vscode_1 = require('vscode');
var TypeScriptHoverProvider = (function () {
    function TypeScriptHoverProvider(client) {
        this.client = client;
    }
    TypeScriptHoverProvider.prototype.provideHover = function (document, position, token) {
        var _this = this;
        var filepath = this.client.asAbsolutePath(document.uri);
        if (!filepath) {
            return Promise.resolve(null);
        }
        var args = {
            file: filepath,
            line: position.line + 1,
            offset: position.character + 1
        };
        if (!args.file) {
            return Promise.resolve(null);
        }
        return this.client.execute('quickinfo', args, token).then(function (response) {
            var data = response.body;
            if (data) {
                return new vscode_1.Hover([{ language: 'typescript', value: data.displayString }, data.documentation], new vscode_1.Range(data.start.line - 1, data.start.offset - 1, data.end.line - 1, data.end.offset - 1));
            }
        }, function (err) {
            _this.client.error("'quickinfo' request failed with error.", err);
            return null;
        });
    };
    return TypeScriptHoverProvider;
}());
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = TypeScriptHoverProvider;
//# sourceMappingURL=https://ticino.blob.core.windows.net/sourcemaps/ee428b0eead68bf0fb99ab5fdc4439be227b6281/extensions/typescript/out/features/hoverProvider.js.map
