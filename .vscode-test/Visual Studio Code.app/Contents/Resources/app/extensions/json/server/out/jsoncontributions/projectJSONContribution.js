/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var vscode_languageserver_1 = require('vscode-languageserver');
var Strings = require('../utils/strings');
var request_light_1 = require('request-light');
var nls = require('vscode-nls');
var localize = nls.loadMessageBundle(__filename);
var FEED_INDEX_URL = 'https://api.nuget.org/v3/index.json';
var LIMIT = 30;
var RESOLVE_ID = 'ProjectJSONContribution-';
var CACHE_EXPIRY = 1000 * 60 * 5; // 5 minutes
var ProjectJSONContribution = (function () {
    function ProjectJSONContribution() {
        this.cachedProjects = {};
        this.cacheSize = 0;
    }
    ProjectJSONContribution.prototype.isProjectJSONFile = function (resource) {
        return Strings.endsWith(resource, '/project.json');
    };
    ProjectJSONContribution.prototype.completeWithCache = function (id, item) {
        var entry = this.cachedProjects[id];
        if (entry) {
            if (new Date().getTime() - entry.time > CACHE_EXPIRY) {
                delete this.cachedProjects[id];
                this.cacheSize--;
                return false;
            }
            var insertTextValue = item.insertText.value;
            item.detail = entry.version;
            item.documentation = entry.description;
            item.insertText = insertTextValue.replace(/\$1/, '${1:' + entry.version + '}');
            return true;
        }
        return false;
    };
    ProjectJSONContribution.prototype.addCached = function (id, version, description) {
        this.cachedProjects[id] = { version: version, description: description, time: new Date().getTime() };
        this.cacheSize++;
        if (this.cacheSize > 50) {
            var currentTime = new Date().getTime();
            for (var id_1 in this.cachedProjects) {
                var entry = this.cachedProjects[id_1];
                if (currentTime - entry.time > CACHE_EXPIRY) {
                    delete this.cachedProjects[id_1];
                    this.cacheSize--;
                }
            }
        }
    };
    ProjectJSONContribution.prototype.getNugetIndex = function () {
        if (!this.nugetIndexPromise) {
            this.nugetIndexPromise = this.makeJSONRequest(FEED_INDEX_URL).then(function (indexContent) {
                var services = {};
                if (indexContent && Array.isArray(indexContent.resources)) {
                    var resources = indexContent.resources;
                    for (var i = resources.length - 1; i >= 0; i--) {
                        var type = resources[i]['@type'];
                        var id = resources[i]['@id'];
                        if (type && id) {
                            services[type] = id;
                        }
                    }
                }
                return services;
            });
        }
        return this.nugetIndexPromise;
    };
    ProjectJSONContribution.prototype.getNugetService = function (serviceType) {
        return this.getNugetIndex().then(function (services) {
            var serviceURL = services[serviceType];
            if (!serviceURL) {
                return Promise.reject(localize(0, null, serviceType));
            }
            return serviceURL;
        });
    };
    ProjectJSONContribution.prototype.collectDefaultCompletions = function (resource, result) {
        if (this.isProjectJSONFile(resource)) {
            var insertText = vscode_languageserver_1.SnippetString.create(JSON.stringify({
                'version': '${1:1.0.0-*}',
                'dependencies': {},
                'frameworks': {
                    'net461': {},
                    'netcoreapp1.0': {}
                }
            }, null, '\t'));
            result.add({ kind: 7 /* Class */, label: localize(1, null), insertText: insertText, documentation: '' });
        }
        return null;
    };
    ProjectJSONContribution.prototype.makeJSONRequest = function (url) {
        return request_light_1.xhr({
            url: url
        }).then(function (success) {
            if (success.status === 200) {
                try {
                    return JSON.parse(success.responseText);
                }
                catch (e) {
                    return Promise.reject(localize(2, null, url));
                }
            }
            return Promise.reject(localize(3, null, url, success.responseText));
        }, function (error) {
            return Promise.reject(localize(4, null, url, request_light_1.getErrorStatusDescription(error.status)));
        });
    };
    ProjectJSONContribution.prototype.collectPropertyCompletions = function (resource, location, currentWord, addValue, isLast, result) {
        var _this = this;
        if (this.isProjectJSONFile(resource) && (matches(location, ['dependencies']) || matches(location, ['frameworks', '*', 'dependencies']) || matches(location, ['frameworks', '*', 'frameworkAssemblies']))) {
            return this.getNugetService('SearchAutocompleteService').then(function (service) {
                var queryUrl;
                if (currentWord.length > 0) {
                    queryUrl = service + '?q=' + encodeURIComponent(currentWord) + '&take=' + LIMIT;
                }
                else {
                    queryUrl = service + '?take=' + LIMIT;
                }
                return _this.makeJSONRequest(queryUrl).then(function (resultObj) {
                    if (Array.isArray(resultObj.data)) {
                        var results = resultObj.data;
                        for (var i = 0; i < results.length; i++) {
                            var name = results[i];
                            var insertText = JSON.stringify(name);
                            if (addValue) {
                                insertText += ': "$1"';
                                if (!isLast) {
                                    insertText += ',';
                                }
                            }
                            var item = { kind: 10 /* Property */, label: name, insertText: vscode_languageserver_1.SnippetString.create(insertText), filterText: JSON.stringify(name) };
                            if (!_this.completeWithCache(name, item)) {
                                item.data = RESOLVE_ID + name;
                            }
                            result.add(item);
                        }
                        if (results.length === LIMIT) {
                            result.setAsIncomplete();
                        }
                    }
                }, function (error) {
                    result.error(error);
                });
            }, function (error) {
                result.error(error);
            });
        }
        ;
        return null;
    };
    ProjectJSONContribution.prototype.collectValueCompletions = function (resource, location, currentKey, result) {
        var _this = this;
        if (this.isProjectJSONFile(resource) && (matches(location, ['dependencies']) || matches(location, ['frameworks', '*', 'dependencies']) || matches(location, ['frameworks', '*', 'frameworkAssemblies']))) {
            return this.getNugetService('PackageBaseAddress/3.0.0').then(function (service) {
                var queryUrl = service + currentKey + '/index.json';
                return _this.makeJSONRequest(queryUrl).then(function (obj) {
                    if (Array.isArray(obj.versions)) {
                        var results = obj.versions;
                        for (var i = 0; i < results.length; i++) {
                            var curr = results[i];
                            var name = JSON.stringify(curr);
                            var label = name;
                            var documentation = '';
                            result.add({ kind: 7 /* Class */, label: label, insertText: name, documentation: documentation });
                        }
                        if (results.length === LIMIT) {
                            result.setAsIncomplete();
                        }
                    }
                }, function (error) {
                    result.error(error);
                });
            }, function (error) {
                result.error(error);
            });
        }
        return null;
    };
    ProjectJSONContribution.prototype.getInfoContribution = function (resource, location) {
        var _this = this;
        if (this.isProjectJSONFile(resource) && (matches(location, ['dependencies', '*']) || matches(location, ['frameworks', '*', 'dependencies', '*']) || matches(location, ['frameworks', '*', 'frameworkAssemblies', '*']))) {
            var pack_1 = location[location.length - 1];
            return this.getNugetService('SearchQueryService').then(function (service) {
                var queryUrl = service + '?q=' + encodeURIComponent(pack_1) + '&take=' + 5;
                return _this.makeJSONRequest(queryUrl).then(function (resultObj) {
                    var htmlContent = [];
                    htmlContent.push(localize(5, null, pack_1));
                    if (Array.isArray(resultObj.data)) {
                        var results = resultObj.data;
                        for (var i = 0; i < results.length; i++) {
                            var res = results[i];
                            _this.addCached(res.id, res.version, res.description);
                            if (res.id === pack_1) {
                                if (res.description) {
                                    htmlContent.push(vscode_languageserver_1.MarkedString.fromPlainText(res.description));
                                }
                                if (res.version) {
                                    htmlContent.push(vscode_languageserver_1.MarkedString.fromPlainText(localize(6, null, res.version)));
                                }
                                break;
                            }
                        }
                    }
                    return htmlContent;
                }, function (error) {
                    return null;
                });
            }, function (error) {
                return null;
            });
        }
        return null;
    };
    ProjectJSONContribution.prototype.resolveSuggestion = function (item) {
        var _this = this;
        if (item.data && Strings.startsWith(item.data, RESOLVE_ID)) {
            var pack_2 = item.data.substring(RESOLVE_ID.length);
            if (this.completeWithCache(pack_2, item)) {
                return Promise.resolve(item);
            }
            return this.getNugetService('SearchQueryService').then(function (service) {
                var queryUrl = service + '?q=' + encodeURIComponent(pack_2) + '&take=' + 10;
                return _this.makeJSONRequest(queryUrl).then(function (resultObj) {
                    var itemResolved = false;
                    if (Array.isArray(resultObj.data)) {
                        var results = resultObj.data;
                        for (var i = 0; i < results.length; i++) {
                            var curr = results[i];
                            _this.addCached(curr.id, curr.version, curr.description);
                            if (curr.id === pack_2) {
                                _this.completeWithCache(pack_2, item);
                                itemResolved = true;
                            }
                        }
                    }
                    return itemResolved ? item : null;
                });
            });
        }
        ;
        return null;
    };
    return ProjectJSONContribution;
}());
exports.ProjectJSONContribution = ProjectJSONContribution;
function matches(segments, pattern) {
    var k = 0;
    for (var i = 0; k < pattern.length && i < segments.length; i++) {
        if (pattern[k] === segments[i] || pattern[k] === '*') {
            k++;
        }
        else if (pattern[k] !== '**') {
            return false;
        }
    }
    return k === pattern.length;
}
//# sourceMappingURL=https://ticino.blob.core.windows.net/sourcemaps/ee428b0eead68bf0fb99ab5fdc4439be227b6281/extensions/json/server/out/jsoncontributions/projectJSONContribution.js.map
