/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var vscode_1 = require('vscode');
var PConst = require('../protocol.const');
var outlineTypeTable = Object.create(null);
outlineTypeTable[PConst.Kind.module] = vscode_1.SymbolKind.Module;
outlineTypeTable[PConst.Kind.class] = vscode_1.SymbolKind.Class;
outlineTypeTable[PConst.Kind.enum] = vscode_1.SymbolKind.Enum;
outlineTypeTable[PConst.Kind.interface] = vscode_1.SymbolKind.Interface;
outlineTypeTable[PConst.Kind.memberFunction] = vscode_1.SymbolKind.Method;
outlineTypeTable[PConst.Kind.memberVariable] = vscode_1.SymbolKind.Property;
outlineTypeTable[PConst.Kind.memberGetAccessor] = vscode_1.SymbolKind.Property;
outlineTypeTable[PConst.Kind.memberSetAccessor] = vscode_1.SymbolKind.Property;
outlineTypeTable[PConst.Kind.variable] = vscode_1.SymbolKind.Variable;
outlineTypeTable[PConst.Kind.const] = vscode_1.SymbolKind.Variable;
outlineTypeTable[PConst.Kind.localVariable] = vscode_1.SymbolKind.Variable;
outlineTypeTable[PConst.Kind.variable] = vscode_1.SymbolKind.Variable;
outlineTypeTable[PConst.Kind.function] = vscode_1.SymbolKind.Function;
outlineTypeTable[PConst.Kind.localFunction] = vscode_1.SymbolKind.Function;
function textSpan2Range(value) {
    return new vscode_1.Range(value.start.line - 1, value.start.offset - 1, value.end.line - 1, value.end.offset - 1);
}
var TypeScriptDocumentSymbolProvider = (function () {
    function TypeScriptDocumentSymbolProvider(client) {
        this.client = client;
    }
    TypeScriptDocumentSymbolProvider.prototype.provideDocumentSymbols = function (resource, token) {
        var _this = this;
        var filepath = this.client.asAbsolutePath(resource.uri);
        if (!filepath) {
            return Promise.resolve([]);
        }
        var args = {
            file: filepath
        };
        if (!args.file) {
            return Promise.resolve([]);
        }
        function convertNavBar(indent, foldingMap, bucket, item, containerLabel) {
            var realIndent = indent + item.indent;
            var key = realIndent + "|" + item.text;
            if (realIndent !== 0 && !foldingMap[key]) {
                var result = new vscode_1.SymbolInformation(item.text, outlineTypeTable[item.kind] || vscode_1.SymbolKind.Variable, containerLabel ? containerLabel : '', new vscode_1.Location(resource.uri, textSpan2Range(item.spans[0])));
                foldingMap[key] = result;
                bucket.push(result);
            }
            if (item.childItems && item.childItems.length > 0) {
                for (var _i = 0, _a = item.childItems; _i < _a.length; _i++) {
                    var child = _a[_i];
                    convertNavBar(realIndent + 1, foldingMap, bucket, child, item.text);
                }
            }
        }
        function convertNavTree(bucket, item, containerLabel) {
            var result = new vscode_1.SymbolInformation(item.text, outlineTypeTable[item.kind] || vscode_1.SymbolKind.Variable, containerLabel ? containerLabel : '', new vscode_1.Location(resource.uri, textSpan2Range(item.spans[0])));
            if (item.childItems && item.childItems.length > 0) {
                for (var _i = 0, _a = item.childItems; _i < _a.length; _i++) {
                    var child = _a[_i];
                    convertNavTree(bucket, child, result.name);
                }
            }
            bucket.push(result);
        }
        if (this.client.apiVersion.has206Features()) {
            return this.client.execute('navtree', args, token).then(function (response) {
                var result = [];
                if (response.body) {
                    // The root represents the file. Ignore this when showing in the UI
                    var tree = response.body;
                    if (tree.childItems) {
                        tree.childItems.forEach(function (item) { return convertNavTree(result, item); });
                    }
                }
                return result;
            }, function (err) {
                _this.client.error("'navtree' request failed with error.", err);
                return [];
            });
        }
        else {
            return this.client.execute('navbar', args, token).then(function (response) {
                var result = [];
                if (response.body) {
                    var foldingMap_1 = Object.create(null);
                    response.body.forEach(function (item) { return convertNavBar(0, foldingMap_1, result, item); });
                }
                return result;
            }, function (err) {
                _this.client.error("'navbar' request failed with error.", err);
                return [];
            });
        }
    };
    return TypeScriptDocumentSymbolProvider;
}());
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = TypeScriptDocumentSymbolProvider;
//# sourceMappingURL=https://ticino.blob.core.windows.net/sourcemaps/ee428b0eead68bf0fb99ab5fdc4439be227b6281/extensions/typescript/out/features/documentSymbolProvider.js.map
