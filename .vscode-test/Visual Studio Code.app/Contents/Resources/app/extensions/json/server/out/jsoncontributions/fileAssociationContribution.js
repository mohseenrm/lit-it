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
    { kind: 12 /* Value */, label: localize(0, null), insertText: vscode_languageserver_1.SnippetString.create('"*.${1:extension}": "${2:language}"'), documentation: localize(1, null) },
    { kind: 12 /* Value */, label: localize(2, null), insertText: vscode_languageserver_1.SnippetString.create('"/${1:path to file}/*.${2:extension}": "${3:language}"'), documentation: localize(3, null) }
];
var FileAssociationContribution = (function () {
    function FileAssociationContribution() {
    }
    FileAssociationContribution.prototype.setLanguageIds = function (ids) {
        this.languageIds = ids;
    };
    FileAssociationContribution.prototype.isSettingsFile = function (resource) {
        return Strings.endsWith(resource, '/settings.json');
    };
    FileAssociationContribution.prototype.collectDefaultCompletions = function (resource, result) {
        return null;
    };
    FileAssociationContribution.prototype.collectPropertyCompletions = function (resource, location, currentWord, addValue, isLast, result) {
        if (this.isSettingsFile(resource) && location.length === 1 && location[0] === 'files.associations') {
            globProperties.forEach(function (e) {
                result.add(e);
            });
        }
        return null;
    };
    FileAssociationContribution.prototype.collectValueCompletions = function (resource, location, currentKey, result) {
        if (this.isSettingsFile(resource) && location.length === 1 && location[0] === 'files.associations') {
            this.languageIds.forEach(function (l) {
                result.add({
                    kind: 12 /* Value */,
                    label: l,
                    insertText: vscode_languageserver_1.SnippetString.create(JSON.stringify('${1:' + l + '}')),
                    filterText: JSON.stringify(l)
                });
            });
        }
        return null;
    };
    FileAssociationContribution.prototype.getInfoContribution = function (resource, location) {
        return null;
    };
    return FileAssociationContribution;
}());
exports.FileAssociationContribution = FileAssociationContribution;
//# sourceMappingURL=https://ticino.blob.core.windows.net/sourcemaps/ee428b0eead68bf0fb99ab5fdc4439be227b6281/extensions/json/server/out/jsoncontributions/fileAssociationContribution.js.map
