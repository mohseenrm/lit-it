/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var vscode_1 = require('vscode');
var TypeScriptDocumentHighlightProvider = (function () {
    function TypeScriptDocumentHighlightProvider(client) {
        this.client = client;
    }
    TypeScriptDocumentHighlightProvider.prototype.provideDocumentHighlights = function (resource, position, token) {
        var _this = this;
        var filepath = this.client.asAbsolutePath(resource.uri);
        if (!filepath) {
            return Promise.resolve([]);
        }
        var args = {
            file: filepath,
            line: position.line + 1,
            offset: position.character + 1
        };
        if (!args.file) {
            return Promise.resolve([]);
        }
        return this.client.execute('occurrences', args, token).then(function (response) {
            var data = response.body;
            if (data && data.length) {
                // Workaround for https://github.com/Microsoft/TypeScript/issues/12780
                // Don't highlight string occurrences
                var firstOccurrence = data[0];
                if (_this.client.apiVersion.has213Features() && firstOccurrence.start.offset > 1) {
                    // Check to see if contents around first occurrence are string delimiters
                    var contents = resource.getText(new vscode_1.Range(firstOccurrence.start.line - 1, firstOccurrence.start.offset - 1 - 1, firstOccurrence.end.line - 1, firstOccurrence.end.offset - 1 + 1));
                    var stringDelimiters = ['"', '\'', '`'];
                    if (contents && contents.length > 2 && stringDelimiters.indexOf(contents[0]) >= 0 && contents[0] === contents[contents.length - 1]) {
                        return [];
                    }
                }
                return data.map(function (item) {
                    return new vscode_1.DocumentHighlight(new vscode_1.Range(item.start.line - 1, item.start.offset - 1, item.end.line - 1, item.end.offset - 1), item.isWriteAccess ? vscode_1.DocumentHighlightKind.Write : vscode_1.DocumentHighlightKind.Read);
                });
            }
            return [];
        }, function (err) {
            _this.client.error("'occurrences' request failed with error.", err);
            return [];
        });
    };
    return TypeScriptDocumentHighlightProvider;
}());
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = TypeScriptDocumentHighlightProvider;
//# sourceMappingURL=https://ticino.blob.core.windows.net/sourcemaps/ee428b0eead68bf0fb99ab5fdc4439be227b6281/extensions/typescript/out/features/documentHighlightProvider.js.map
