/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var vscode = require('vscode');
var vscode_nls_1 = require('vscode-nls');
var path_1 = require('path');
var localize = vscode_nls_1.loadMessageBundle(__filename);
var selector = ['javascript', 'javascriptreact'];
var fileLimit = 500;
var ExcludeHintItem = (function () {
    function ExcludeHintItem(client) {
        this._client = client;
        this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
        this._item.command = 'js.projectStatus.command';
    }
    ExcludeHintItem.prototype.getCurrentHint = function () {
        return this._currentHint;
    };
    ExcludeHintItem.prototype.hide = function () {
        this._item.hide();
    };
    ExcludeHintItem.prototype.show = function (configFileName, largeRoots, onExecute) {
        var _this = this;
        this._currentHint = {
            message: largeRoots.length > 0
                ? localize(0, null, largeRoots)
                : localize(1, null),
            options: [{
                    title: localize(2, null),
                    execute: function () {
                        _this._client.logTelemetry('js.hintProjectExcludes.accepted');
                        onExecute();
                        _this._item.hide();
                        var configFileUri;
                        if (vscode.workspace.rootPath && path_1.dirname(configFileName).indexOf(vscode.workspace.rootPath) === 0) {
                            configFileUri = vscode.Uri.file(configFileName);
                        }
                        else {
                            configFileUri = vscode.Uri.parse('untitled://' + path_1.join(vscode.workspace.rootPath || '', 'jsconfig.json'));
                        }
                        return vscode.workspace.openTextDocument(configFileName)
                            .then(vscode.window.showTextDocument);
                    }
                }]
        };
        this._item.tooltip = this._currentHint.message;
        this._item.text = localize(3, null);
        this._item.tooltip = localize(4, null);
        this._item.color = '#A5DF3B';
        this._item.show();
        this._client.logTelemetry('js.hintProjectExcludes');
    };
    return ExcludeHintItem;
}());
function createLargeProjectMonitorForProject(item, client, isOpen, memento) {
    var toDispose = [];
    var projectHinted = Object.create(null);
    var projectHintIgnoreList = memento.get('projectHintIgnoreList', []);
    for (var _i = 0, projectHintIgnoreList_1 = projectHintIgnoreList; _i < projectHintIgnoreList_1.length; _i++) {
        var path = projectHintIgnoreList_1[_i];
        if (path === null) {
            path = 'undefined';
        }
        projectHinted[path] = true;
    }
    function onEditor(editor) {
        if (!editor
            || !vscode.languages.match(selector, editor.document)
            || !client.asAbsolutePath(editor.document.uri)) {
            item.hide();
            return;
        }
        var file = client.asAbsolutePath(editor.document.uri);
        if (!file) {
            return;
        }
        isOpen(file).then(function (value) {
            if (!value) {
                return;
            }
            return client.execute('projectInfo', { file: file, needFileNameList: true }).then(function (res) {
                if (!res.body) {
                    return;
                }
                var _a = res.body, configFileName = _a.configFileName, fileNames = _a.fileNames;
                if (projectHinted[configFileName] === true || !fileNames) {
                    return;
                }
                if (fileNames.length > fileLimit || res.body.languageServiceDisabled) {
                    var largeRoots = computeLargeRoots(configFileName, fileNames).map(function (f) { return ("'/" + f + "/'"); }).join(', ');
                    item.show(configFileName, largeRoots, function () {
                        projectHinted[configFileName] = true;
                    });
                }
                else {
                    item.hide();
                }
            });
        }).catch(function (err) {
            client.warn(err);
        });
    }
    toDispose.push(vscode.workspace.onDidChangeTextDocument(function (e) {
        delete projectHinted[e.document.fileName];
    }));
    toDispose.push(vscode.window.onDidChangeActiveTextEditor(onEditor));
    onEditor(vscode.window.activeTextEditor);
    return toDispose;
}
function createLargeProjectMonitorFromTypeScript(item, client) {
    return client.onProjectLanguageServiceStateChanged(function (body) {
        if (body.languageServiceEnabled) {
            item.hide();
        }
        else {
            item.show(body.projectName, '', function () { });
        }
    });
}
function create(client, isOpen, memento) {
    var toDispose = [];
    var item = new ExcludeHintItem(client);
    toDispose.push(vscode.commands.registerCommand('js.projectStatus.command', function () {
        var _a = item.getCurrentHint(), message = _a.message, options = _a.options;
        return (_b = vscode.window).showInformationMessage.apply(_b, [message].concat(options)).then(function (selection) {
            if (selection) {
                return selection.execute();
            }
        });
        var _b;
    }));
    if (client.apiVersion.has213Features()) {
        toDispose.push(createLargeProjectMonitorFromTypeScript(item, client));
    }
    else {
        toDispose.push.apply(toDispose, createLargeProjectMonitorForProject(item, client, isOpen, memento));
    }
    return (_a = vscode.Disposable).from.apply(_a, toDispose);
    var _a;
}
exports.create = create;
function computeLargeRoots(configFileName, fileNames) {
    var roots = Object.create(null);
    var dir = path_1.dirname(configFileName);
    // console.log(dir, fileNames);
    for (var _i = 0, fileNames_1 = fileNames; _i < fileNames_1.length; _i++) {
        var fileName = fileNames_1[_i];
        if (fileName.indexOf(dir) === 0) {
            var first = fileName.substring(dir.length + 1);
            first = first.substring(0, first.indexOf('/'));
            if (first) {
                roots[first] = (roots[first] || 0) + 1;
            }
        }
    }
    var data = [];
    for (var key in roots) {
        data.push({ root: key, count: roots[key] });
    }
    data
        .sort(function (a, b) { return b.count - a.count; })
        .filter(function (s) { return s.root === 'src' || s.root === 'test' || s.root === 'tests'; });
    var result = [];
    var sum = 0;
    for (var _a = 0, data_1 = data; _a < data_1.length; _a++) {
        var e = data_1[_a];
        sum += e.count;
        result.push(e.root);
        if (fileNames.length - sum < fileLimit) {
            break;
        }
    }
    return result;
}
//# sourceMappingURL=https://ticino.blob.core.windows.net/sourcemaps/ee428b0eead68bf0fb99ab5fdc4439be227b6281/extensions/typescript/out/utils/projectStatus.js.map
