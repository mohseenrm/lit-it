/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var path = require('path');
var fs = require('fs');
var electron = require('./utils/electron');
var wireProtocol_1 = require('./utils/wireProtocol');
var vscode_1 = require('vscode');
var typescriptService_1 = require('./typescriptService');
var VersionStatus = require('./utils/versionStatus');
var is = require('./utils/is');
var vscode_extension_telemetry_1 = require('vscode-extension-telemetry');
var nls = require('vscode-nls');
var localize = nls.loadMessageBundle(__filename);
var Trace;
(function (Trace) {
    Trace[Trace["Off"] = 0] = "Off";
    Trace[Trace["Messages"] = 1] = "Messages";
    Trace[Trace["Verbose"] = 2] = "Verbose";
})(Trace || (Trace = {}));
var Trace;
(function (Trace) {
    function fromString(value) {
        value = value.toLowerCase();
        switch (value) {
            case 'off':
                return Trace.Off;
            case 'messages':
                return Trace.Messages;
            case 'verbose':
                return Trace.Verbose;
            default:
                return Trace.Off;
        }
    }
    Trace.fromString = fromString;
})(Trace || (Trace = {}));
var MessageAction;
(function (MessageAction) {
    MessageAction[MessageAction["useLocal"] = 0] = "useLocal";
    MessageAction[MessageAction["useBundled"] = 1] = "useBundled";
    MessageAction[MessageAction["neverCheckLocalVersion"] = 2] = "neverCheckLocalVersion";
    MessageAction[MessageAction["close"] = 3] = "close";
})(MessageAction || (MessageAction = {}));
var TypeScriptServiceClient = (function () {
    function TypeScriptServiceClient(host, storagePath, globalState) {
        var _this = this;
        this._onProjectLanguageServiceStateChanged = new vscode_1.EventEmitter();
        this.host = host;
        this.storagePath = storagePath;
        this.globalState = globalState;
        this.pathSeparator = path.sep;
        var p = new Promise(function (resolve, reject) {
            _this._onReady = { promise: p, resolve: resolve, reject: reject };
        });
        this._onReady.promise = p;
        this.servicePromise = null;
        this.lastError = null;
        this.sequenceNumber = 0;
        this.exitRequested = false;
        this.firstStart = Date.now();
        this.numberRestarts = 0;
        this.requestQueue = [];
        this.pendingResponses = 0;
        this.callbacks = Object.create(null);
        var configuration = vscode_1.workspace.getConfiguration();
        this.tsdk = configuration.get('typescript.tsdk', null);
        this._experimentalAutoBuild = false; // configuration.get<boolean>('typescript.tsserver.experimentalAutoBuild', false);
        this._apiVersion = new typescriptService_1.API('1.0.0');
        this._checkGlobalTSCVersion = true;
        this.trace = this.readTrace();
        vscode_1.workspace.onDidChangeConfiguration(function () {
            _this.trace = _this.readTrace();
            var oldTsdk = _this.tsdk;
            _this.tsdk = vscode_1.workspace.getConfiguration().get('typescript.tsdk', null);
            if (_this.servicePromise === null && oldTsdk !== _this.tsdk) {
                _this.startService();
            }
        });
        if (this.packageInfo && this.packageInfo.aiKey) {
            this.telemetryReporter = new vscode_extension_telemetry_1.default(this.packageInfo.name, this.packageInfo.version, this.packageInfo.aiKey);
        }
        this.startService();
    }
    Object.defineProperty(TypeScriptServiceClient.prototype, "onProjectLanguageServiceStateChanged", {
        get: function () {
            return this._onProjectLanguageServiceStateChanged.event;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TypeScriptServiceClient.prototype, "output", {
        get: function () {
            if (!this._output) {
                this._output = vscode_1.window.createOutputChannel(localize(0, null));
            }
            return this._output;
        },
        enumerable: true,
        configurable: true
    });
    TypeScriptServiceClient.prototype.readTrace = function () {
        var result = Trace.fromString(vscode_1.workspace.getConfiguration().get('typescript.tsserver.trace', 'off'));
        if (result === Trace.Off && !!process.env.TSS_TRACE) {
            result = Trace.Messages;
        }
        return result;
    };
    Object.defineProperty(TypeScriptServiceClient.prototype, "experimentalAutoBuild", {
        get: function () {
            return this._experimentalAutoBuild;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TypeScriptServiceClient.prototype, "checkGlobalTSCVersion", {
        get: function () {
            return this._checkGlobalTSCVersion;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TypeScriptServiceClient.prototype, "apiVersion", {
        get: function () {
            return this._apiVersion;
        },
        enumerable: true,
        configurable: true
    });
    TypeScriptServiceClient.prototype.onReady = function () {
        return this._onReady.promise;
    };
    TypeScriptServiceClient.prototype.data2String = function (data) {
        if (data instanceof Error) {
            if (is.string(data.stack)) {
                return data.stack;
            }
            return data.message;
        }
        if (is.boolean(data.success) && !data.success && is.string(data.message)) {
            return data.message;
        }
        if (is.string(data)) {
            return data;
        }
        return data.toString();
    };
    TypeScriptServiceClient.prototype.info = function (message, data) {
        this.output.appendLine("[Info  - " + (new Date().toLocaleTimeString()) + "] " + message);
        if (data) {
            this.output.appendLine(this.data2String(data));
        }
    };
    TypeScriptServiceClient.prototype.warn = function (message, data) {
        this.output.appendLine("[Warn  - " + (new Date().toLocaleTimeString()) + "] " + message);
        if (data) {
            this.output.appendLine(this.data2String(data));
        }
    };
    TypeScriptServiceClient.prototype.error = function (message, data) {
        // See https://github.com/Microsoft/TypeScript/issues/10496
        if (data && data.message === 'No content available.') {
            return;
        }
        this.output.appendLine("[Error - " + (new Date().toLocaleTimeString()) + "] " + message);
        if (data) {
            this.output.appendLine(this.data2String(data));
        }
        // VersionStatus.enable(true);
        // this.output.show(true);
    };
    TypeScriptServiceClient.prototype.logTrace = function (message, data) {
        this.output.appendLine("[Trace - " + (new Date().toLocaleTimeString()) + "] " + message);
        if (data) {
            this.output.appendLine(this.data2String(data));
        }
        // this.output.show(true);
    };
    Object.defineProperty(TypeScriptServiceClient.prototype, "packageInfo", {
        get: function () {
            if (this._packageInfo !== undefined) {
                return this._packageInfo;
            }
            var packagePath = path.join(__dirname, './../package.json');
            var extensionPackage = require(packagePath);
            if (extensionPackage) {
                this._packageInfo = {
                    name: extensionPackage.name,
                    version: extensionPackage.version,
                    aiKey: extensionPackage.aiKey
                };
            }
            else {
                this._packageInfo = null;
            }
            return this._packageInfo;
        },
        enumerable: true,
        configurable: true
    });
    TypeScriptServiceClient.prototype.logTelemetry = function (eventName, properties) {
        if (this.telemetryReporter) {
            this.telemetryReporter.sendTelemetryEvent(eventName, properties);
        }
    };
    TypeScriptServiceClient.prototype.service = function () {
        if (this.servicePromise) {
            return this.servicePromise;
        }
        if (this.lastError) {
            return Promise.reject(this.lastError);
        }
        this.startService();
        if (this.servicePromise) {
            return this.servicePromise;
        }
        return Promise.reject(new Error('Could not create TS service'));
    };
    TypeScriptServiceClient.prototype.startService = function (resendModels) {
        var _this = this;
        if (resendModels === void 0) { resendModels = false; }
        var modulePath = path.join(__dirname, '..', 'node_modules', 'typescript', 'lib', 'tsserver.js');
        var showVersionStatusItem = false;
        if (this.tsdk) {
            this._checkGlobalTSCVersion = false;
            if (path.isAbsolute(this.tsdk)) {
                modulePath = path.join(this.tsdk, 'tsserver.js');
            }
            else if (vscode_1.workspace.rootPath) {
                modulePath = path.join(vscode_1.workspace.rootPath, this.tsdk, 'tsserver.js');
            }
        }
        var tsConfig = vscode_1.workspace.getConfiguration('typescript');
        var checkWorkspaceVersionKey = 'check.workspaceVersion';
        this.servicePromise = new Promise(function (resolve, reject) {
            var versionCheckPromise = Promise.resolve(modulePath);
            if (!vscode_1.workspace.rootPath) {
                versionCheckPromise = _this.informAboutTS20(modulePath);
            }
            else {
                if (!_this.tsdk && tsConfig.get(checkWorkspaceVersionKey, true)) {
                    var localModulePath_1 = path.join(vscode_1.workspace.rootPath, 'node_modules', 'typescript', 'lib', 'tsserver.js');
                    if (fs.existsSync(localModulePath_1)) {
                        var localVersion = _this.getTypeScriptVersion(localModulePath_1);
                        var shippedVersion = _this.getTypeScriptVersion(modulePath);
                        if (localVersion && localVersion !== shippedVersion) {
                            _this._checkGlobalTSCVersion = false;
                            versionCheckPromise = vscode_1.window.showInformationMessage(localize(1, null, localVersion, shippedVersion), {
                                title: localize(2, null, localVersion),
                                id: MessageAction.useLocal
                            }, {
                                title: localize(3, null, shippedVersion),
                                id: MessageAction.useBundled,
                            }, {
                                title: localize(4, null),
                                id: MessageAction.neverCheckLocalVersion
                            }, {
                                title: localize(5, null),
                                id: MessageAction.close,
                                isCloseAffordance: true
                            }).then(function (selected) {
                                if (!selected || selected.id === MessageAction.close) {
                                    return modulePath;
                                }
                                switch (selected.id) {
                                    case MessageAction.useLocal:
                                        var pathValue = './node_modules/typescript/lib';
                                        tsConfig.update('tsdk', pathValue, false);
                                        vscode_1.window.showInformationMessage(localize(6, null, pathValue));
                                        showVersionStatusItem = true;
                                        return localModulePath_1;
                                    case MessageAction.useBundled:
                                        tsConfig.update(checkWorkspaceVersionKey, false, false);
                                        vscode_1.window.showInformationMessage(localize(7, null));
                                        return modulePath;
                                    case MessageAction.neverCheckLocalVersion:
                                        vscode_1.window.showInformationMessage(localize(8, null));
                                        tsConfig.update(checkWorkspaceVersionKey, false, true);
                                        return modulePath;
                                    default:
                                        return modulePath;
                                }
                            });
                        }
                    }
                    else {
                        versionCheckPromise = _this.informAboutTS20(modulePath);
                    }
                }
            }
            versionCheckPromise.then(function (modulePath) {
                _this.info("Using tsserver from location: " + modulePath);
                if (!fs.existsSync(modulePath)) {
                    vscode_1.window.showErrorMessage(localize(9, null, path.dirname(modulePath)));
                    _this.servicePromise = null;
                    reject(new Error('No TSServer found'));
                    return;
                }
                var version = _this.getTypeScriptVersion(modulePath);
                if (!version) {
                    version = vscode_1.workspace.getConfiguration().get('typescript.tsdk_version', undefined);
                }
                if (version) {
                    _this._apiVersion = new typescriptService_1.API(version);
                }
                var label = version || localize(10, null);
                var tooltip = modulePath;
                VersionStatus.enable(!!_this.tsdk || showVersionStatusItem);
                VersionStatus.setInfo(label, tooltip);
                // This is backwards compatibility code to move the setting from the local
                // store into the workspace setting file.
                var doGlobalVersionCheckKey = 'doGlobalVersionCheck';
                var globalStateValue = _this.globalState.get(doGlobalVersionCheckKey, true);
                var checkTscVersion = 'check.tscVersion';
                if (!globalStateValue) {
                    tsConfig.update(checkTscVersion, false, true);
                    _this.globalState.update(doGlobalVersionCheckKey, true);
                }
                try {
                    var options = {
                        execArgv: [] // [`--debug-brk=5859`]
                    };
                    if (vscode_1.workspace.rootPath) {
                        options.cwd = vscode_1.workspace.rootPath;
                    }
                    var value = process.env.TSS_DEBUG;
                    if (value) {
                        var port = parseInt(value);
                        if (!isNaN(port)) {
                            _this.info("TSServer started in debug mode using port " + port);
                            options.execArgv = [("--debug=" + port)];
                        }
                    }
                    var args = [];
                    if (_this.apiVersion.has206Features()) {
                        args.push('--useSingleInferredProject');
                        if (vscode_1.workspace.getConfiguration().get('typescript.disableAutomaticTypeAcquisition', false)) {
                            args.push('--disableAutomaticTypingAcquisition');
                        }
                    }
                    if (_this.apiVersion.has208Features()) {
                        args.push('--enableTelemetry');
                    }
                    electron.fork(modulePath, args, options, function (err, childProcess) {
                        if (err) {
                            _this.lastError = err;
                            _this.error('Starting TSServer failed with error.', err);
                            vscode_1.window.showErrorMessage(localize(11, null, err.message || err));
                            _this.logTelemetry('error', { message: err.message });
                            return;
                        }
                        _this.lastStart = Date.now();
                        childProcess.on('error', function (err) {
                            _this.lastError = err;
                            _this.error('TSServer errored with error.', err);
                            _this.serviceExited(false);
                        });
                        childProcess.on('exit', function (code) {
                            _this.error("TSServer exited with code: " + (code ? code : 'unknown'));
                            _this.serviceExited(true);
                        });
                        _this.reader = new wireProtocol_1.Reader(childProcess.stdout, function (msg) {
                            _this.dispatchMessage(msg);
                        });
                        _this._onReady.resolve();
                        resolve(childProcess);
                        _this.serviceStarted(resendModels);
                    });
                }
                catch (error) {
                    reject(error);
                }
            });
        });
    };
    TypeScriptServiceClient.prototype.informAboutTS20 = function (modulePath) {
        return Promise.resolve(modulePath);
    };
    TypeScriptServiceClient.prototype.serviceStarted = function (resendModels) {
        var _this = this;
        var configureOptions = {
            hostInfo: 'vscode'
        };
        if (this._experimentalAutoBuild && this.storagePath) {
            try {
                fs.mkdirSync(this.storagePath);
            }
            catch (error) {
            }
        }
        this.execute('configure', configureOptions);
        if (this.apiVersion.has206Features()) {
            var compilerOptions = {
                module: 'CommonJS',
                target: 'ES6',
                allowSyntheticDefaultImports: true,
                allowNonTsExtensions: true,
                allowJs: true,
                jsx: 'Preserve'
            };
            var args = {
                options: compilerOptions
            };
            this.execute('compilerOptionsForInferredProjects', args, true).catch(function (err) {
                _this.error("'compilerOptionsForInferredProjects' request failed with error.", err);
            });
        }
        if (resendModels) {
            this.host.populateService();
        }
    };
    TypeScriptServiceClient.prototype.getTypeScriptVersion = function (serverPath) {
        var p = serverPath.split(path.sep);
        if (p.length <= 2) {
            return undefined;
        }
        var p2 = p.slice(0, -2);
        var modulePath = p2.join(path.sep);
        var fileName = path.join(modulePath, 'package.json');
        if (!fs.existsSync(fileName)) {
            return undefined;
        }
        var contents = fs.readFileSync(fileName).toString();
        var desc = null;
        try {
            desc = JSON.parse(contents);
        }
        catch (err) {
            return undefined;
        }
        if (!desc || !desc.version) {
            return undefined;
        }
        return desc.version;
    };
    TypeScriptServiceClient.prototype.serviceExited = function (restart) {
        var _this = this;
        this.servicePromise = null;
        Object.keys(this.callbacks).forEach(function (key) {
            _this.callbacks[parseInt(key)].e(new Error('Service died.'));
        });
        this.callbacks = Object.create(null);
        if (!this.exitRequested && restart) {
            var diff = Date.now() - this.lastStart;
            this.numberRestarts++;
            var startService = true;
            if (this.numberRestarts > 5) {
                if (diff < 60 * 1000 /* 1 Minutes */) {
                    vscode_1.window.showWarningMessage(localize(12, null));
                }
                else if (diff < 2 * 1000 /* 2 seconds */) {
                    startService = false;
                    vscode_1.window.showErrorMessage(localize(13, null));
                    this.logTelemetry('serviceExited');
                }
            }
            if (startService) {
                this.startService(true);
            }
        }
    };
    TypeScriptServiceClient.prototype.asAbsolutePath = function (resource) {
        if (resource.scheme !== 'file') {
            return null;
        }
        var result = resource.fsPath;
        if (!result) {
            return null;
        }
        // Both \ and / must be escaped in regular expressions
        return result.replace(new RegExp('\\' + this.pathSeparator, 'g'), '/');
    };
    TypeScriptServiceClient.prototype.asUrl = function (filepath) {
        return vscode_1.Uri.file(filepath);
    };
    TypeScriptServiceClient.prototype.execute = function (command, args, expectsResultOrToken, token) {
        var _this = this;
        var expectsResult = true;
        if (typeof expectsResultOrToken === 'boolean') {
            expectsResult = expectsResultOrToken;
        }
        else {
            token = expectsResultOrToken;
        }
        var request = {
            seq: this.sequenceNumber++,
            type: 'request',
            command: command,
            arguments: args
        };
        var requestInfo = {
            request: request,
            promise: null,
            callbacks: null
        };
        var result = Promise.resolve(null);
        if (expectsResult) {
            result = new Promise(function (resolve, reject) {
                requestInfo.callbacks = { c: resolve, e: reject, start: Date.now() };
                if (token) {
                    token.onCancellationRequested(function () {
                        _this.tryCancelRequest(request.seq);
                        resolve(undefined);
                    });
                }
            });
        }
        requestInfo.promise = result;
        this.requestQueue.push(requestInfo);
        this.sendNextRequests();
        return result;
    };
    TypeScriptServiceClient.prototype.sendNextRequests = function () {
        while (this.pendingResponses === 0 && this.requestQueue.length > 0) {
            var item = this.requestQueue.shift();
            if (item) {
                this.sendRequest(item);
            }
        }
    };
    TypeScriptServiceClient.prototype.sendRequest = function (requestItem) {
        var _this = this;
        var serverRequest = requestItem.request;
        this.traceRequest(serverRequest, !!requestItem.callbacks);
        if (requestItem.callbacks) {
            this.callbacks[serverRequest.seq] = requestItem.callbacks;
            this.pendingResponses++;
        }
        this.service().then(function (childProcess) {
            childProcess.stdin.write(JSON.stringify(serverRequest) + '\r\n', 'utf8');
        }).catch(function (err) {
            var callback = _this.callbacks[serverRequest.seq];
            if (callback) {
                callback.e(err);
                delete _this.callbacks[serverRequest.seq];
                _this.pendingResponses--;
            }
        });
    };
    TypeScriptServiceClient.prototype.tryCancelRequest = function (seq) {
        for (var i = 0; i < this.requestQueue.length; i++) {
            if (this.requestQueue[i].request.seq === seq) {
                this.requestQueue.splice(i, 1);
                if (this.trace !== Trace.Off) {
                    this.logTrace("TypeScript Service: canceled request with sequence number " + seq);
                }
                return true;
            }
        }
        if (this.trace !== Trace.Off) {
            this.logTrace("TypeScript Service: tried to cancel request with sequence number " + seq + ". But request got already delivered.");
        }
        return false;
    };
    TypeScriptServiceClient.prototype.dispatchMessage = function (message) {
        try {
            if (message.type === 'response') {
                var response = message;
                var p = this.callbacks[response.request_seq];
                if (p) {
                    this.traceResponse(response, p.start);
                    delete this.callbacks[response.request_seq];
                    this.pendingResponses--;
                    if (response.success) {
                        p.c(response);
                    }
                    else {
                        this.logTelemetry('requestFailed', {
                            id: response.request_seq.toString(),
                            command: response.command,
                            message: response.message ? response.message : 'No detailed message provided'
                        });
                        p.e(response);
                    }
                }
            }
            else if (message.type === 'event') {
                var event = message;
                this.traceEvent(event);
                if (event.event === 'syntaxDiag') {
                    this.host.syntaxDiagnosticsReceived(event);
                }
                else if (event.event === 'semanticDiag') {
                    this.host.semanticDiagnosticsReceived(event);
                }
                else if (event.event === 'configFileDiag') {
                    this.host.configFileDiagnosticsReceived(event);
                }
                else if (event.event === 'telemetry') {
                    var telemetryData = event.body;
                    var properties_1 = Object.create(null);
                    switch (telemetryData.telemetryEventName) {
                        case 'typingsInstalled':
                            var typingsInstalledPayload = telemetryData.payload;
                            properties_1['installedPackages'] = typingsInstalledPayload.installedPackages;
                            if (is.defined(typingsInstalledPayload.installSuccess)) {
                                properties_1['installSuccess'] = typingsInstalledPayload.installSuccess.toString();
                            }
                            if (is.string(typingsInstalledPayload.typingsInstallerVersion)) {
                                properties_1['typingsInstallerVersion'] = typingsInstalledPayload.typingsInstallerVersion;
                            }
                            break;
                        default:
                            var payload_1 = telemetryData.payload;
                            if (payload_1) {
                                Object.keys(payload_1).forEach(function (key) {
                                    if (payload_1.hasOwnProperty(key) && is.string(payload_1[key])) {
                                        properties_1[key] = payload_1[key];
                                    }
                                });
                            }
                            break;
                    }
                    this.logTelemetry(telemetryData.telemetryEventName, properties_1);
                }
                else if (event.event === 'projectLanguageServiceState') {
                    var data = event.body;
                    if (data) {
                        this._onProjectLanguageServiceStateChanged.fire(data);
                    }
                }
            }
            else {
                throw new Error('Unknown message type ' + message.type + ' recevied');
            }
        }
        finally {
            this.sendNextRequests();
        }
    };
    TypeScriptServiceClient.prototype.traceRequest = function (request, responseExpected) {
        if (this.trace === Trace.Off) {
            return;
        }
        var data = undefined;
        if (this.trace === Trace.Verbose && request.arguments) {
            data = "Arguments: " + JSON.stringify(request.arguments, [], 4);
        }
        this.logTrace("Sending request: " + request.command + " (" + request.seq + "). Response expected: " + (responseExpected ? 'yes' : 'no') + ". Current queue length: " + this.requestQueue.length, data);
    };
    TypeScriptServiceClient.prototype.traceResponse = function (response, startTime) {
        if (this.trace === Trace.Off) {
            return;
        }
        var data = undefined;
        if (this.trace === Trace.Verbose && response.body) {
            data = "Result: " + JSON.stringify(response.body, [], 4);
        }
        this.logTrace("Response received: " + response.command + " (" + response.request_seq + "). Request took " + (Date.now() - startTime) + " ms. Success: " + response.success + " " + (!response.success ? '. Message: ' + response.message : ''), data);
    };
    TypeScriptServiceClient.prototype.traceEvent = function (event) {
        if (this.trace === Trace.Off) {
            return;
        }
        var data = undefined;
        if (this.trace === Trace.Verbose && event.body) {
            data = "Data: " + JSON.stringify(event.body, [], 4);
        }
        this.logTrace("Event received: " + event.event + " (" + event.seq + ").", data);
    };
    return TypeScriptServiceClient;
}());
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = TypeScriptServiceClient;
//# sourceMappingURL=https://ticino.blob.core.windows.net/sourcemaps/ee428b0eead68bf0fb99ab5fdc4439be227b6281/extensions/typescript/out/typescriptServiceClient.js.map
