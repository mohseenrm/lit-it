/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var vscode_languageserver_1 = require('vscode-languageserver');
var Strings = require('../utils/strings');
var nls = require('vscode-nls');
var localize = nls.loadMessageBundle(__filename);
var globProperties = [
    { kind: 12 /* Value */, label: localize(0, null), insertText: vscode_languageserver_1.SnippetString.create('"**/*.${1:extension}": true'), documentation: localize(1, null) },
    { kind: 12 /* Value */, label: localize(2, null), insertText: '"**/*.{ext1,ext2,ext3}": true', documentation: localize(3, null) },
    { kind: 12 /* Value */, label: localize(4, null), insertText: vscode_languageserver_1.SnippetString.create('"**/*.${1:source-extension}": { "when": "$(basename).${2:target-extension}" }'), documentation: localize(5, null) },
    { kind: 12 /* Value */, label: localize(6, null), insertText: vscode_languageserver_1.SnippetString.create('"${1:name}": true'), documentation: localize(7, null) },
    { kind: 12 /* Value */, label: localize(8, null), insertText: '"{folder1,folder2,folder3}": true', documentation: localize(9, null) },
    { kind: 12 /* Value */, label: localize(10, null), insertText: vscode_languageserver_1.SnippetString.create('"**/${1:name}": true'), documentation: localize(11, null) },
];
var globValues = [
    { kind: 12 /* Value */, label: localize(12, null), filterText: 'true', insertText: 'true', documentation: localize(13, null) },
    { kind: 12 /* Value */, label: localize(14, null), filterText: 'false', insertText: 'false', documentation: localize(15, null) },
    { kind: 12 /* Value */, label: localize(16, null), insertText: vscode_languageserver_1.SnippetString.create('{ "when": "$(basename).${1:extension}" }'), documentation: localize(17, null) }
];
var GlobPatternContribution = (function () {
    function GlobPatternContribution() {
    }
    GlobPatternContribution.prototype.isSettingsFile = function (resource) {
        return Strings.endsWith(resource, '/settings.json');
    };
    GlobPatternContribution.prototype.collectDefaultCompletions = function (resource, result) {
        return null;
    };
    GlobPatternContribution.prototype.collectPropertyCompletions = function (resource, location, currentWord, addValue, isLast, result) {
        if (this.isSettingsFile(resource) && location.length === 1 && ((location[0] === 'files.exclude') || (location[0] === 'search.exclude'))) {
            globProperties.forEach(function (e) {
                result.add(e);
            });
        }
        return null;
    };
    GlobPatternContribution.prototype.collectValueCompletions = function (resource, location, currentKey, result) {
        if (this.isSettingsFile(resource) && location.length === 1 && ((location[0] === 'files.exclude') || (location[0] === 'search.exclude'))) {
            globValues.forEach(function (e) {
                result.add(e);
            });
        }
        return null;
    };
    GlobPatternContribution.prototype.getInfoContribution = function (resource, location) {
        return null;
    };
    return GlobPatternContribution;
}());
exports.GlobPatternContribution = GlobPatternContribution;
//# sourceMappingURL=https://ticino.blob.core.windows.net/sourcemaps/ee428b0eead68bf0fb99ab5fdc4439be227b6281/extensions/json/server/out/jsoncontributions/globPatternContribution.js.map
