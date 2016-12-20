/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var vscode_debugadapter_1 = require("vscode-debugadapter");
var nodeV8Protocol_1 = require("./nodeV8Protocol");
var sourceMaps_1 = require("./sourceMaps");
var PathUtils = require("./pathUtilities");
var CP = require("child_process");
var Net = require("net");
var URL = require("url");
var Path = require("path");
var FS = require("fs");
var nls = require("vscode-nls");
var localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);
var Expander = (function () {
    function Expander(func) {
        this._expanderFunction = func;
    }
    Expander.prototype.Expand = function (session, filter, start, count) {
        return this._expanderFunction(start, count);
    };
    Expander.prototype.SetValue = function (session, name, value) {
        return Promise.reject(new Error(Expander.SET_VALUE_ERROR));
    };
    return Expander;
}());
Expander.SET_VALUE_ERROR = localize(0, null);
exports.Expander = Expander;
var PropertyContainer = (function () {
    function PropertyContainer(obj, ths) {
        this._object = obj;
        this._this = ths;
    }
    PropertyContainer.prototype.Expand = function (session, filter, start, count) {
        var _this = this;
        if (filter === 'named') {
            return session._createProperties(this._object, 'named').then(function (variables) {
                if (_this._this) {
                    return session._createVariable('this', _this._this).then(function (variable) {
                        if (variable) {
                            variables.push(variable);
                        }
                        return variables;
                    });
                }
                else {
                    return variables;
                }
            });
        }
        if (typeof start === 'number' && typeof count === 'number') {
            return session._createProperties(this._object, 'indexed', start, count);
        }
        else {
            return session._createProperties(this._object, 'all').then(function (variables) {
                if (_this._this) {
                    return session._createVariable('this', _this._this).then(function (variable) {
                        if (variable) {
                            variables.push(variable);
                        }
                        return variables;
                    });
                }
                else {
                    return variables;
                }
            });
        }
    };
    PropertyContainer.prototype.SetValue = function (session, name, value) {
        return session._setPropertyValue(this._object.handle, name, value);
    };
    return PropertyContainer;
}());
exports.PropertyContainer = PropertyContainer;
var SetMapContainer = (function () {
    function SetMapContainer(obj) {
        this._object = obj;
    }
    SetMapContainer.prototype.Expand = function (session, filter, start, count) {
        if (filter === 'named') {
            return session._createSetMapProperties(this._object);
        }
        if (this._object.type === 'set') {
            return session._createSetElements(this._object, start, count);
        }
        else {
            return session._createMapElements(this._object, start, count);
        }
    };
    SetMapContainer.prototype.SetValue = function (session, name, value) {
        return Promise.reject(new Error(Expander.SET_VALUE_ERROR));
    };
    return SetMapContainer;
}());
exports.SetMapContainer = SetMapContainer;
var ScopeContainer = (function () {
    function ScopeContainer(scope, obj, ths) {
        this._frame = scope.frameIndex;
        this._scope = scope.index;
        this._object = obj;
        this._this = ths;
    }
    ScopeContainer.prototype.Expand = function (session, filter, start, count) {
        var _this = this;
        return session._createProperties(this._object, filter).then(function (variables) {
            if (_this._this) {
                return session._createVariable('this', _this._this).then(function (variable) {
                    if (variable) {
                        variables.push(variable);
                    }
                    return variables;
                });
            }
            else {
                return variables;
            }
        });
    };
    ScopeContainer.prototype.SetValue = function (session, name, value) {
        return session._setVariableValue(this._frame, this._scope, name, value);
    };
    return ScopeContainer;
}());
exports.ScopeContainer = ScopeContainer;
var Script = (function () {
    function Script(script) {
        this.contents = script.source;
    }
    return Script;
}());
var InternalSourceBreakpoint = (function () {
    function InternalSourceBreakpoint(line, column, condition, hitter) {
        if (column === void 0) { column = 0; }
        this.line = this.orgLine = line;
        this.column = this.orgColumn = column;
        this.condition = condition;
        this.hitCount = 0;
        this.hitter = hitter;
    }
    return InternalSourceBreakpoint;
}());
/**
 * A SourceSource represents the source contents of an internal module or of a source map with inlined contents.
 */
var SourceSource = (function () {
    function SourceSource(sid, content) {
        this.scriptId = sid;
        this.source = content;
    }
    return SourceSource;
}());
var NodeDebugSession = (function (_super) {
    __extends(NodeDebugSession, _super);
    function NodeDebugSession() {
        var _this = _super.call(this) || this;
        _this._traceAll = false;
        // options
        _this._tryToInjectExtension = true;
        _this._skipRejects = false; // do not stop on rejected promises
        _this._maxVariablesPerScope = 100; // only load this many variables for a scope
        _this._smartStep = false; // try to automatically step over uninteresting source
        _this._mapToFilesOnDisk = true; // by default try to map node.js scripts to files on disk
        _this._compareContents = true; // by default verify that script contents is same as file contents
        _this._supportsRunInTerminalRequest = false;
        _this._nodeProcessId = -1; // pid of the node runtime
        _this._functionBreakpoints = new Array(); // node function breakpoint ids
        _this._scripts = new Map(); // script cache
        _this._files = new Map(); // file cache
        _this._scriptId2Handle = new Map();
        _this._inlinedContentHandle = new Map();
        _this._modifiedSources = new Set(); // track edited files
        _this._hitCounts = new Map(); // breakpoint ID -> ignore count
        // session configurations
        _this._noDebug = false;
        _this._attachMode = false;
        _this._restartMode = false;
        _this._console = 'internalConsole';
        _this._stepBack = false;
        // state valid between stop events
        _this._variableHandles = new vscode_debugadapter_1.Handles();
        _this._frameHandles = new vscode_debugadapter_1.Handles();
        _this._sourceHandles = new vscode_debugadapter_1.Handles();
        _this._refCache = new Map();
        _this._pollForNodeProcess = false;
        _this._nodeInjectionAvailable = false;
        _this._gotDebuggerEvent = false;
        _this._smartStepCount = 0;
        _this._catchRejects = false;
        _this._disableSkipFiles = false;
        // this debugger uses zero-based lines and columns which is the default
        // so the following two calls are not really necessary.
        _this.setDebuggerLinesStartAt1(false);
        _this.setDebuggerColumnsStartAt1(false);
        _this._node = new nodeV8Protocol_1.NodeV8Protocol(function (response) {
            // if request successful, cache alls refs
            if (response.success && response.refs) {
                var oldSize = _this._refCache.size;
                for (var _i = 0, _a = response.refs; _i < _a.length; _i++) {
                    var r = _a[_i];
                    _this._cache(r.handle, r);
                }
                if (_this._refCache.size !== oldSize) {
                    _this.log('rc', "NodeV8Protocol hook: ref cache size: " + _this._refCache.size);
                }
            }
        });
        _this._node.on('break', function (event) {
            _this._stopped('break');
            _this._handleNodeBreakEvent(event.body);
        });
        _this._node.on('exception', function (event) {
            _this._stopped('exception');
            _this._handleNodeBreakEvent(event.body);
        });
        /*
        this._node.on('beforeCompile', (event: NodeV8Event) => {
            this.outLine(`beforeCompile ${event.body.name}`);
        });
        this._node.on('afterCompile', (event: NodeV8Event) => {
            this.outLine(`afterCompile ${event.body.name}`);
        });
        */
        _this._node.on('close', function (event) {
            _this._terminated('node v8protocol close');
        });
        _this._node.on('error', function (event) {
            _this._terminated('node v8protocol error');
        });
        return _this;
        /*
        this._node.on('diagnostic', (event: NodeV8Event) => {
            this.outLine(`diagnostic event ${event.body.reason}`);
        });
        */
    }
    /**
     * Analyse why node has stopped and sends StoppedEvent if necessary.
     */
    NodeDebugSession.prototype._handleNodeBreakEvent = function (eventBody) {
        var _this = this;
        var isEntry = false;
        var reason;
        // in order to identify reject calls and debugger statements extract source at current location
        var source = null;
        if (eventBody.sourceLineText && typeof eventBody.sourceColumn === 'number') {
            source = eventBody.sourceLineText.substr(eventBody.sourceColumn);
        }
        // is exception?
        if (eventBody.exception) {
            if (this._skip(eventBody)) {
                this._node.command('continue');
                return;
            }
            // if this exception originates from a 'reject', skip it if 'All Exception' is not set.
            if (this._skipRejects && source && source.indexOf('reject') === 0) {
                if (!this._catchRejects) {
                    this._node.command('continue');
                    return;
                }
                if (eventBody.exception.text === 'undefined') {
                    eventBody.exception.text = 'reject';
                }
            }
            // remember exception
            this._exception = eventBody.exception;
            this._handleNodeBreakEvent2(this._reasonText('exception'), isEntry, eventBody.exception.text);
            return;
        }
        // is breakpoint?
        if (!reason) {
            var breakpoints = eventBody.breakpoints;
            if (Array.isArray(breakpoints) && breakpoints.length > 0) {
                this._disableSkipFiles = this._skip(eventBody);
                var id = breakpoints[0];
                if (!this._gotEntryEvent && id === 1) {
                    isEntry = true;
                    this.log('la', '_analyzeBreak: suppressed stop-on-entry event');
                    reason = this._reasonText('entry');
                    this._rememberEntryLocation(eventBody.script.name, eventBody.sourceLine, eventBody.sourceColumn);
                }
                else {
                    var ibp = this._hitCounts.get(id);
                    if (ibp) {
                        ibp.hitCount++;
                        if (ibp.hitter && !ibp.hitter(ibp.hitCount)) {
                            this._node.command('continue');
                            return;
                        }
                    }
                    reason = this._reasonText('breakpoint');
                }
            }
        }
        // is debugger statement?
        if (!reason) {
            if (source && source.indexOf('debugger') === 0) {
                reason = this._reasonText('debugger');
                this._gotDebuggerEvent = true;
            }
        }
        // no reason yet: must be the result of a 'step'
        if (!reason) {
            if (this._restartFramePending) {
                this._restartFramePending = false;
                reason = this._reasonText('frame_entry');
            }
            else {
                reason = this._reasonText('step');
            }
            if (!this._disableSkipFiles) {
                // should we continue until we find a better place to stop?
                if ((this._smartStep && this._sourceMaps) || this._skipFiles) {
                    this._skipGenerated(eventBody).then(function (r) {
                        if (r) {
                            _this._node.command('continue', { stepaction: 'in' });
                            _this._smartStepCount++;
                        }
                        else {
                            _this._handleNodeBreakEvent2(reason, isEntry);
                        }
                    });
                    return;
                }
            }
        }
        this._handleNodeBreakEvent2(reason, isEntry);
    };
    NodeDebugSession.prototype._reasonText = function (reason) {
        switch (reason) {
            case 'entry':
                return localize(1, null);
            case 'exception':
                return localize(2, null);
            case 'breakpoint':
                return localize(3, null);
            case 'debugger':
                return localize(4, null);
            case 'frame_entry':
                return localize(5, null);
            case 'step':
                return localize(6, null);
            case 'user_request':
                return localize(7, null);
            default:
                return reason;
        }
    };
    NodeDebugSession.prototype._handleNodeBreakEvent2 = function (reason, isEntry, exception_text) {
        this._lastStoppedEvent = new vscode_debugadapter_1.StoppedEvent(reason, NodeDebugSession.DUMMY_THREAD_ID, exception_text);
        if (!isEntry) {
            if (this._smartStepCount > 0) {
                this.log('ss', "_handleNodeBreakEvent: " + this._smartStepCount + " steps skipped");
                this._smartStepCount = 0;
            }
            this.sendEvent(this._lastStoppedEvent);
        }
    };
    /**
     * Returns true if a source location of the given event should be skipped.
     */
    NodeDebugSession.prototype._skip = function (event) {
        if (this._skipFiles) {
            var path = event.script.name;
            if (path /*&& PathUtils.isAbsolutePath(path)*/) {
                // if launch.json defines localRoot and remoteRoot try to convert remote path back to a local path
                var localPath = this._remoteToLocal(path);
                return PathUtils.multiGlobMatches(this._skipFiles, localPath);
            }
        }
        return false;
    };
    /**
     * Returns true if a source location of the given event should be skipped.
     */
    NodeDebugSession.prototype._skipGenerated = function (event) {
        var path = event.script.name;
        if (path /*&& PathUtils.isAbsolutePath(path)*/) {
            // if launch.json defines localRoot and remoteRoot try to convert remote path back to a local path
            var localPath = this._remoteToLocal(path);
            if (this._skipFiles) {
                if (PathUtils.multiGlobMatches(this._skipFiles, localPath)) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            }
            // try to map
            var line = event.sourceLine;
            var column = this._adjustColumn(line, event.sourceColumn);
            return this._sourceMaps.MapToSource(localPath, null, line, column).then(function (mapresult) {
                return !mapresult;
            });
        }
        // skip everything
        return Promise.resolve(true);
    };
    /**
     * clear everything that is no longer valid after a new stopped event.
     */
    NodeDebugSession.prototype._stopped = function (reason) {
        this._stoppedReason = reason;
        this.log('la', "_stopped: got " + reason + " event from node");
        this._exception = undefined;
        this._variableHandles.reset();
        this._frameHandles.reset();
        this._refCache = new Map();
        this.log('rc', "_stopped: new ref cache");
    };
    /**
     * The debug session has terminated.
     */
    NodeDebugSession.prototype._terminated = function (reason) {
        this.log('la', "_terminated: " + reason);
        if (!this._isTerminated) {
            this._isTerminated = true;
            if (this._restartMode && !this._inShutdown) {
                this.sendEvent(new vscode_debugadapter_1.TerminatedEvent(true));
            }
            else {
                this.sendEvent(new vscode_debugadapter_1.TerminatedEvent());
            }
        }
    };
    //---- initialize request -------------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.initializeRequest = function (response, args) {
        this.log('la', "initializeRequest: adapterID: " + args.adapterID);
        this._adapterID = args.adapterID;
        if (typeof args.supportsRunInTerminalRequest === 'boolean') {
            this._supportsRunInTerminalRequest = args.supportsRunInTerminalRequest;
        }
        //---- Send back feature and their options
        response.body = response.body || {};
        // This debug adapter supports the configurationDoneRequest.
        response.body.supportsConfigurationDoneRequest = true;
        // This debug adapter supports function breakpoints.
        response.body.supportsFunctionBreakpoints = true;
        // This debug adapter supports conditional breakpoints.
        response.body.supportsConditionalBreakpoints = true;
        // This debug adapter does not support a side effect free evaluate request for data hovers.
        response.body.supportsEvaluateForHovers = false;
        // This debug adapter supports two exception breakpoint filters
        response.body.exceptionBreakpointFilters = [
            {
                label: localize(8, null),
                filter: 'all',
                default: false
            },
            {
                label: localize(9, null),
                filter: 'uncaught',
                default: true
            }
        ];
        // This debug adapter supports setting variables
        response.body.supportsSetVariable = true;
        // This debug adapter supports the restartFrame request
        response.body.supportsRestartFrame = true;
        // This debug adapter supports the completions request
        response.body.supportsCompletionsRequest = true;
        this.sendResponse(response);
    };
    //---- launch request -----------------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.launchRequest = function (response, args) {
        var _this = this;
        if (this._processCommonArgs(response, args)) {
            return;
        }
        this._noDebug = (typeof args.noDebug === 'boolean') && args.noDebug;
        if (typeof args.console === 'string') {
            switch (args.console) {
                case 'internalConsole':
                case 'integratedTerminal':
                case 'externalTerminal':
                    this._console = args.console;
                    break;
                default:
                    this.sendErrorResponse(response, 2028, localize(10, null, args.console));
                    return;
            }
        }
        else if (typeof args.externalConsole === 'boolean' && args.externalConsole) {
            this._console = 'externalTerminal';
        }
        var port = args.port || random(3000, 50000);
        var runtimeExecutable = args.runtimeExecutable;
        if (runtimeExecutable) {
            if (!Path.isAbsolute(runtimeExecutable)) {
                if (!PathUtils.isOnPath(runtimeExecutable)) {
                    this.sendErrorResponse(response, 2001, localize(11, null, '{_runtime}'), { _runtime: runtimeExecutable });
                    return;
                }
            }
            else if (!FS.existsSync(runtimeExecutable)) {
                this.sendNotExistErrorResponse(response, 'runtimeExecutable', runtimeExecutable);
                return;
            }
        }
        else {
            if (!PathUtils.isOnPath(NodeDebugSession.NODE)) {
                this.sendErrorResponse(response, 2001, localize(12, null, '{_runtime}'), { _runtime: NodeDebugSession.NODE });
                return;
            }
            runtimeExecutable = NodeDebugSession.NODE; // use node from PATH
        }
        var runtimeArgs = args.runtimeArgs || [];
        var programArgs = args.args || [];
        // special code for 'extensionHost' debugging
        if (this._adapterID === 'extensionHost') {
            // we always launch in 'debug-brk' mode, but we only show the break event if 'stopOnEntry' attribute is true.
            var launchArgs = [runtimeExecutable];
            if (!this._noDebug) {
                launchArgs.push("--debugBrkPluginHost=" + port);
            }
            launchArgs = launchArgs.concat(runtimeArgs, programArgs);
            this._sendLaunchCommandToConsole(launchArgs);
            var cmd = CP.spawn(runtimeExecutable, launchArgs.slice(1));
            cmd.on('error', function (err) {
                _this._terminated("failed to launch extensionHost (" + err + ")");
            });
            this._captureOutput(cmd);
            // we are done!
            this.sendResponse(response);
            return;
        }
        var programPath = args.program;
        if (programPath) {
            if (!Path.isAbsolute(programPath)) {
                this.sendRelativePathErrorResponse(response, 'program', programPath);
                return;
            }
            if (!FS.existsSync(programPath)) {
                this.sendNotExistErrorResponse(response, 'program', programPath);
                return;
            }
            programPath = Path.normalize(programPath);
            if (PathUtils.normalizeDriveLetter(programPath) !== PathUtils.realPath(programPath)) {
                this.outLine(localize(13, null));
            }
        }
        runtimeArgs = args.runtimeArgs || ['--nolazy'];
        if (programPath) {
            if (NodeDebugSession.isJavaScript(programPath)) {
                if (this._sourceMaps) {
                    // if programPath is a JavaScript file and sourceMaps are enabled, we don't know whether
                    // programPath is the generated file or whether it is the source (and we need source mapping).
                    // Typically this happens if a tool like 'babel' or 'uglify' is used (because they both transpile js to js).
                    // We use the source maps to find a 'source' file for the given js file.
                    this._sourceMaps.MapPathFromSource(programPath).then(function (generatedPath) {
                        if (generatedPath && generatedPath !== programPath) {
                            // programPath must be source because there seems to be a generated file for it
                            _this.log('sm', "launchRequest: program '" + programPath + "' seems to be the source; launch the generated file '" + generatedPath + "' instead");
                            programPath = generatedPath;
                        }
                        else {
                            _this.log('sm', "launchRequest: program '" + programPath + "' seems to be the generated file");
                        }
                        _this.launchRequest2(response, args, programPath, programArgs, runtimeExecutable, runtimeArgs, port);
                    });
                    return;
                }
            }
            else {
                // node cannot execute the program directly
                if (!this._sourceMaps) {
                    this.sendErrorResponse(response, 2002, localize(14, null, '{path}'), { path: programPath });
                    return;
                }
                this._sourceMaps.MapPathFromSource(programPath).then(function (generatedPath) {
                    if (!generatedPath) {
                        _this.sendErrorResponse(response, 2003, localize(15, null, '{path}', 'outFiles'), { path: programPath });
                        return;
                    }
                    _this.log('sm', "launchRequest: program '" + programPath + "' seems to be the source; launch the generated file '" + generatedPath + "' instead");
                    programPath = generatedPath;
                    _this.launchRequest2(response, args, programPath, programArgs, runtimeExecutable, runtimeArgs, port);
                });
                return;
            }
        }
        this.launchRequest2(response, args, programPath, programArgs, runtimeExecutable, runtimeArgs, port);
    };
    NodeDebugSession.prototype.launchRequest2 = function (response, args, programPath, programArgs, runtimeExecutable, runtimeArgs, port) {
        var _this = this;
        var program;
        var workingDirectory = args.cwd;
        if (workingDirectory) {
            if (!Path.isAbsolute(workingDirectory)) {
                this.sendRelativePathErrorResponse(response, 'cwd', workingDirectory);
                return;
            }
            if (!FS.existsSync(workingDirectory)) {
                this.sendNotExistErrorResponse(response, 'cwd', workingDirectory);
                return;
            }
            // if working dir is given and if the executable is within that folder, we make the executable path relative to the working dir
            if (programPath) {
                program = Path.relative(workingDirectory, programPath);
            }
        }
        else if (programPath) {
            // if no working dir given, we use the direct folder of the executable
            workingDirectory = Path.dirname(programPath);
            program = Path.basename(programPath);
        }
        // we always break on entry (but if user did not request this, we will not stop in the UI).
        var launchArgs = [runtimeExecutable];
        if (!this._noDebug && !args.port) {
            launchArgs.push("--debug-brk=" + port);
        }
        launchArgs = launchArgs.concat(runtimeArgs);
        if (program) {
            launchArgs.push(program);
        }
        launchArgs = launchArgs.concat(programArgs);
        var address = args.address;
        var timeout = args.timeout;
        var envVars = args.env;
        // read env from disk and merge into envVars
        if (args.envFile) {
            try {
                var buffer = FS.readFileSync(args.envFile, 'utf8');
                var env_1 = {};
                buffer.split('\n').forEach(function (line) {
                    var r = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
                    if (r !== null) {
                        var value = r[2] || '';
                        if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
                            value = value.replace(/\\n/gm, '\n');
                        }
                        env_1[r[1]] = value.replace(/(^['"]|['"]$)/g, '');
                    }
                });
                envVars = PathUtils.extendObject(env_1, args.env); // launch config env vars overwrite .env vars
            }
            catch (e) {
                this.sendErrorResponse(response, 2029, localize(16, null, '{_error}'), { _error: e.message });
                return;
            }
        }
        if (this._supportsRunInTerminalRequest && (this._console === 'externalTerminal' || this._console === 'integratedTerminal')) {
            var termArgs = {
                kind: this._console === 'integratedTerminal' ? 'integrated' : 'external',
                title: localize(17, null),
                cwd: workingDirectory,
                args: launchArgs,
                env: envVars
            };
            this.runInTerminalRequest(termArgs, NodeDebugSession.RUNINTERMINAL_TIMEOUT, function (runResponse) {
                if (runResponse.success) {
                    // since node starts in a terminal, we cannot track it with an 'exit' handler
                    // plan for polling after we have gotten the process pid.
                    _this._pollForNodeProcess = true;
                    if (_this._noDebug) {
                        _this.sendResponse(response);
                    }
                    else {
                        _this._attach(response, port, address, timeout);
                    }
                }
                else {
                    _this.sendErrorResponse(response, 2011, localize(18, null, '{_error}'), { _error: runResponse.message });
                    _this._terminated('terminal error: ' + runResponse.message);
                }
            });
        }
        else {
            this._sendLaunchCommandToConsole(launchArgs);
            // merge environment variables into a copy of the process.env
            envVars = PathUtils.extendObject(PathUtils.extendObject({}, process.env), envVars);
            var options = {
                cwd: workingDirectory,
                env: envVars
            };
            var nodeProcess = CP.spawn(runtimeExecutable, launchArgs.slice(1), options);
            nodeProcess.on('error', function (error) {
                // tslint:disable-next-line:no-bitwise
                _this.sendErrorResponse(response, 2017, localize(19, null, '{_error}'), { _error: error.message }, vscode_debugadapter_1.ErrorDestination.Telemetry | vscode_debugadapter_1.ErrorDestination.User);
                _this._terminated("failed to launch target (" + error + ")");
            });
            nodeProcess.on('exit', function () {
                _this._terminated('target exited');
            });
            nodeProcess.on('close', function (code) {
                _this._terminated('target closed');
            });
            this._nodeProcessId = nodeProcess.pid;
            this._captureOutput(nodeProcess);
            if (this._noDebug) {
                this.sendResponse(response);
            }
            else {
                this._attach(response, port, address, timeout);
            }
        }
    };
    NodeDebugSession.prototype._sendLaunchCommandToConsole = function (args) {
        // print the command to launch the target to the debug console
        var cli = '';
        for (var _i = 0, args_1 = args; _i < args_1.length; _i++) {
            var a = args_1[_i];
            if (a.indexOf(' ') >= 0) {
                cli += '\'' + a + '\'';
            }
            else {
                cli += a;
            }
            cli += ' ';
        }
        this.outLine(cli);
    };
    NodeDebugSession.prototype._captureOutput = function (process) {
        var _this = this;
        process.stdout.on('data', function (data) {
            _this.sendEvent(new vscode_debugadapter_1.OutputEvent(data.toString(), 'stdout'));
        });
        process.stderr.on('data', function (data) {
            _this.sendEvent(new vscode_debugadapter_1.OutputEvent(data.toString(), 'stderr'));
        });
    };
    /**
     * returns true on error.
     */
    NodeDebugSession.prototype._processCommonArgs = function (response, args) {
        if (typeof args.trace === 'string') {
            this._trace = args.trace.split(',');
            this._traceAll = this._trace.indexOf('all') >= 0;
        }
        if (typeof args.stepBack === 'boolean') {
            this._stepBack = args.stepBack;
        }
        if (typeof args.mapToFilesOnDisk === 'boolean') {
            this._mapToFilesOnDisk = args.mapToFilesOnDisk;
        }
        if (typeof args.smartStep === 'boolean') {
            this._smartStep = args.smartStep;
        }
        if (typeof args.skipFiles) {
            this._skipFiles = args.skipFiles;
        }
        if (typeof args.stopOnEntry === 'boolean') {
            this._stopOnEntry = args.stopOnEntry;
        }
        if (!this._sourceMaps) {
            if (typeof args.sourceMaps === 'boolean' && args.sourceMaps) {
                var generatedCodeDirectory = args.outDir;
                if (generatedCodeDirectory) {
                    if (!Path.isAbsolute(generatedCodeDirectory)) {
                        this.sendRelativePathErrorResponse(response, 'outDir', generatedCodeDirectory);
                        return true;
                    }
                    if (!FS.existsSync(generatedCodeDirectory)) {
                        this.sendNotExistErrorResponse(response, 'outDir', generatedCodeDirectory);
                        return true;
                    }
                }
                this._sourceMaps = new sourceMaps_1.SourceMaps(this, generatedCodeDirectory, args.outFiles);
            }
        }
        return false;
    };
    //---- attach request -----------------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.attachRequest = function (response, args) {
        if (this._processCommonArgs(response, args)) {
            return;
        }
        if (this._adapterID === 'extensionHost') {
            // in EH mode 'attach' means 'launch' mode
            this._attachMode = false;
        }
        else {
            this._attachMode = true;
        }
        if (typeof args.restart === 'boolean') {
            this._restartMode = args.restart;
        }
        if (args.localRoot) {
            var localRoot = args.localRoot;
            if (!Path.isAbsolute(localRoot)) {
                this.sendRelativePathErrorResponse(response, 'localRoot', localRoot);
                return;
            }
            if (!FS.existsSync(localRoot)) {
                this.sendNotExistErrorResponse(response, 'localRoot', localRoot);
                return;
            }
            this._localRoot = localRoot;
        }
        this._remoteRoot = args.remoteRoot;
        // if a processId is specified, try to bring the process into debug mode.
        if (typeof args.processId === 'string') {
            var pid_string = args.processId.trim();
            if (/^([0-9]+)$/.test(pid_string)) {
                var pid = Number(pid_string);
                try {
                    if (process.platform === 'win32') {
                        // regular node has an undocumented API function for forcing another node process into debug mode.
                        // 		(<any>process)._debugProcess(pid);
                        // But since we are running on Electron's node, process._debugProcess doesn't work (for unknown reasons).
                        // So we use a regular node instead:
                        var command = "node -e process._debugProcess(" + pid + ")";
                        CP.execSync(command);
                    }
                    else {
                        process.kill(pid, 'SIGUSR1');
                    }
                }
                catch (e) {
                    this.sendErrorResponse(response, 2021, localize(20, null, pid, e));
                    return;
                }
            }
            else {
                this.sendErrorResponse(response, 2006, localize(21, null, pid_string));
                return;
            }
        }
        this._attach(response, args.port, args.address, args.timeout);
    };
    /*
     * shared code used in launchRequest and attachRequest
     */
    NodeDebugSession.prototype._attach = function (response, port, address, timeout) {
        var _this = this;
        if (!port) {
            port = 5858;
        }
        if (!address || address === 'localhost') {
            address = '127.0.0.1';
        }
        if (!timeout) {
            timeout = NodeDebugSession.ATTACH_TIMEOUT;
        }
        this.log('la', "_attach: address: " + address + " port: " + port);
        var connected = false;
        var socket = new Net.Socket();
        socket.connect(port, address);
        socket.on('connect', function (err) {
            _this.log('la', '_attach: connected');
            connected = true;
            _this._node.startDispatch(socket, socket);
            _this._initialize(response);
        });
        var endTime = new Date().getTime() + timeout;
        socket.on('error', function (err) {
            if (connected) {
                // since we are connected this error is fatal
                _this._terminated('socket error');
            }
            else {
                // we are not yet connected so retry a few times
                if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
                    var now = new Date().getTime();
                    if (now < endTime) {
                        setTimeout(function () {
                            _this.log('la', '_attach: retry socket.connect');
                            socket.connect(port);
                        }, 200); // retry after 200 ms
                    }
                    else {
                        _this.sendErrorResponse(response, 2009, localize(22, null, '{_timeout}'), { _timeout: timeout });
                    }
                }
                else {
                    _this.sendErrorResponse(response, 2010, localize(23, null, '{_error}'), { _error: err.message });
                }
            }
        });
        socket.on('end', function (err) {
            _this._terminated('socket end');
        });
    };
    NodeDebugSession.prototype._initialize = function (response, retryCount) {
        var _this = this;
        if (retryCount === void 0) { retryCount = 0; }
        this._node.command('evaluate', { expression: 'process.pid', global: true }, function (resp) {
            var ok = resp.success;
            if (resp.success) {
                _this._nodeProcessId = +resp.body.value;
                _this.log('la', "_initialize: got process id " + _this._nodeProcessId + " from node");
            }
            else {
                if (resp.message.indexOf('process is not defined') >= 0) {
                    _this.log('la', '_initialize: process not defined error; got no pid');
                    ok = true; // continue and try to get process.pid later
                }
            }
            if (ok) {
                if (_this._pollForNodeProcess) {
                    _this._pollForNodeTermination();
                }
                setTimeout(function () {
                    _this._injectDebuggerExtensions().then(function (_) {
                        if (!_this._stepBack) {
                            // does runtime support 'step back'?
                            var v = _this._node.embeddedHostVersion; // x.y.z version represented as (x*100+y)*100+z
                            if (!_this._node.v8Version && v >= 70000) {
                                _this._stepBack = true;
                            }
                        }
                        if (_this._stepBack) {
                            response.body = {
                                supportsStepBack: true
                            };
                        }
                        _this.sendResponse(response);
                        _this._startInitialize(!resp.running);
                    });
                }, 10);
            }
            else {
                _this.log('la', '_initialize: retrieving process id from node failed');
                if (retryCount < 10) {
                    setTimeout(function () {
                        // recurse
                        _this._initialize(response, retryCount + 1);
                    }, 50);
                    return;
                }
                else {
                    _this._sendNodeResponse(response, resp);
                }
            }
        });
    };
    NodeDebugSession.prototype._pollForNodeTermination = function () {
        var _this = this;
        var id = setInterval(function () {
            try {
                if (_this._nodeProcessId > 0) {
                    process.kill(_this._nodeProcessId, 0); // node.d.ts doesn't like number argumnent
                }
                else {
                    clearInterval(id);
                }
            }
            catch (e) {
                clearInterval(id);
                _this._terminated('node process kill exception');
            }
        }, NodeDebugSession.NODE_TERMINATION_POLL_INTERVAL);
    };
    /*
     * Inject code into node.js to address slowness issues when inspecting large data structures.
     */
    NodeDebugSession.prototype._injectDebuggerExtensions = function () {
        var _this = this;
        if (this._tryToInjectExtension) {
            var v = this._node.embeddedHostVersion; // x.y.z version represented as (x*100+y)*100+z
            if (this._node.v8Version && ((v >= 1200 && v < 10000) || (v >= 40301 && v < 50000) || (v >= 50600))) {
                try {
                    var contents = FS.readFileSync(Path.join(__dirname, NodeDebugSession.DEBUG_INJECTION), 'utf8');
                    var args_2 = {
                        expression: contents,
                        global: false,
                        disable_break: true
                    };
                    // first try evaluate against the current stack frame
                    return this._node.evaluate(args_2).then(function (resp) {
                        _this.log('la', "_injectDebuggerExtensions: frame based code injection successful");
                        _this._nodeInjectionAvailable = true;
                        return true;
                    }).catch(function (resp) {
                        _this.log('la', "_injectDebuggerExtensions: frame based code injection failed with error '" + resp.message + "'");
                        args_2.global = true;
                        // evaluate globally
                        return _this._node.evaluate(args_2).then(function (resp) {
                            _this.log('la', "_injectDebuggerExtensions: global code injection successful");
                            _this._nodeInjectionAvailable = true;
                            return true;
                        }).catch(function (resp) {
                            _this.log('la', "_injectDebuggerExtensions: global code injection failed with error '" + resp.message + "'");
                            return true;
                        });
                    });
                }
                catch (e) {
                }
            }
        }
        return Promise.resolve(true);
    };
    /*
     * start the initialization sequence:
     * 1. wait for 'break-on-entry' (with timeout)
     * 2. send 'inititialized' event in order to trigger setBreakpointEvents request from client
     * 3. prepare for sending 'break-on-entry' or 'continue' later in configurationDoneRequest()
     */
    NodeDebugSession.prototype._startInitialize = function (stopped, n) {
        var _this = this;
        if (n === void 0) { n = 0; }
        if (n === 0) {
            this.log('la', "_startInitialize: stopped: " + stopped);
        }
        // wait at most 500ms for receiving the break on entry event
        // (since in attach mode we cannot enforce that node is started with --debug-brk, we cannot assume that we receive this event)
        if (!this._gotEntryEvent && n < 10) {
            setTimeout(function () {
                // recurse
                _this._startInitialize(stopped, n + 1);
            }, 50);
            return;
        }
        if (this._gotEntryEvent) {
            this.log('la', "_startInitialize: got break on entry event after " + n + " retries");
            if (this._nodeProcessId <= 0) {
                // if we haven't gotten a process pid so far, we try it again
                this._node.command('evaluate', { expression: 'process.pid', global: true }, function (resp) {
                    if (resp.success) {
                        _this._nodeProcessId = +resp.body.value;
                        _this.log('la', "_initialize: got process id " + _this._nodeProcessId + " from node (2nd try)");
                    }
                    _this._startInitialize2(stopped);
                });
            }
            else {
                this._startInitialize2(stopped);
            }
        }
        else {
            this.log('la', "_startInitialize: no entry event after " + n + " retries; giving up");
            this._gotEntryEvent = true; // we pretend to got one so that no 'entry' event will show up later...
            this._node.command('frame', null, function (resp) {
                if (resp.success) {
                    var s = _this._getValueFromCache(resp.body.script);
                    _this._rememberEntryLocation(s.name, resp.body.line, resp.body.column);
                }
                _this._startInitialize2(stopped);
            });
        }
    };
    NodeDebugSession.prototype._startInitialize2 = function (stopped) {
        // request UI to send breakpoints
        this.log('la', '_startInitialize2: fire initialized event');
        this.sendEvent(new vscode_debugadapter_1.InitializedEvent());
        // in attach-mode we don't know whether the debuggee has been launched in 'stop on entry' mode
        // so we use the stopped state of the VM
        if (this._attachMode) {
            this.log('la', "_startInitialize2: in attach mode we guess stopOnEntry flag to be '" + stopped + "''");
            this._stopOnEntry = stopped;
        }
        if (this._stopOnEntry) {
            // user has requested 'stop on entry' so send out a stop-on-entry event
            this.log('la', '_startInitialize2: fire stop-on-entry event');
            this.sendEvent(new vscode_debugadapter_1.StoppedEvent(this._reasonText('entry'), NodeDebugSession.DUMMY_THREAD_ID));
        }
        else {
            // since we are stopped but UI doesn't know about this, remember that we later do the right thing in configurationDoneRequest()
            if (this._gotDebuggerEvent) {
                this._needDebuggerEvent = true;
            }
            else {
                this.log('la', "_startInitialize2: remember to do a 'Continue' later");
                this._needContinue = true;
            }
        }
    };
    //---- disconnect request -------------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.disconnectRequest = function (response, args) {
        // special code for 'extensionHost' debugging
        if (this._adapterID === 'extensionHost') {
            // detect whether this disconnect request is part of a restart session
            if (this._nodeProcessId > 0 && args && typeof args.restart === 'boolean' && args.restart) {
                // do not kill extensionHost (since vscode will do this for us in a nicer way without killing the window)
                this._nodeProcessId = 0;
            }
        }
        this.shutdown();
        this.log('la', 'disconnectRequest: send response');
        this.sendResponse(response);
    };
    /**
     * Overridden from DebugSession:
     * attach: disconnect from node
     * launch: kill node & subprocesses
     */
    NodeDebugSession.prototype.shutdown = function () {
        if (!this._inShutdown) {
            this._inShutdown = true;
            if (this._attachMode) {
                // disconnect only in attach mode since otherwise node continues to run until it is killed
                this._node.command('disconnect'); // we don't wait for reponse
                // stop socket connection (otherwise node.js dies with ECONNRESET on Windows)
                this._node.stop();
            }
            else {
                // stop socket connection (otherwise node.js dies with ECONNRESET on Windows)
                this._node.stop();
                // kill the whole process tree by starting with the node process
                var pid = this._nodeProcessId;
                if (pid > 0) {
                    this._nodeProcessId = -1;
                    this.log('la', 'shutdown: kill debugee and sub-processes');
                    NodeDebugSession.killTree(pid);
                }
            }
            // plan for shutting down this process after a delay of 100ms
            _super.prototype.shutdown.call(this);
        }
    };
    //--- set breakpoints request ---------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.setBreakPointsRequest = function (response, args) {
        var _this = this;
        this.log('bp', "setBreakPointsRequest: " + JSON.stringify(args.source) + " " + JSON.stringify(args.breakpoints));
        var sbs = new Array();
        // prefer the new API: array of breakpoints
        if (args.breakpoints) {
            for (var _i = 0, _a = args.breakpoints; _i < _a.length; _i++) {
                var b = _a[_i];
                var hitter = void 0;
                if (b.hitCondition) {
                    var result = NodeDebugSession.HITCOUNT_MATCHER.exec(b.hitCondition.trim());
                    if (result && result.length >= 3) {
                        var op = result[1] || '>=';
                        if (op === '=') {
                            op = '==';
                        }
                        var value = result[2];
                        var expr = op === '%'
                            ? "return (hitcnt % " + value + ") === 0;"
                            : "return hitcnt " + op + " " + value + ";";
                        hitter = Function('hitcnt', expr);
                    }
                    else {
                    }
                }
                sbs.push(new InternalSourceBreakpoint(this.convertClientLineToDebugger(b.line), typeof b.column === 'number' ? this.convertClientColumnToDebugger(b.column) : 0, b.condition, hitter));
            }
        }
        else if (args.lines) {
            // deprecated API: convert line number array
            for (var _b = 0, _c = args.lines; _b < _c.length; _b++) {
                var l = _c[_b];
                sbs.push(new InternalSourceBreakpoint(this.convertClientLineToDebugger(l)));
            }
        }
        var source = args.source;
        if (source.path) {
            // as long as node debug doesn't implement 'hot code replacement' we have to mark all breakpoints as unverified.
            var keepUnverified = false;
            if (this._modifiedSources.has(source.path)) {
                keepUnverified = true;
            }
            else {
                if (typeof args.sourceModified === 'boolean' && args.sourceModified) {
                    keepUnverified = true;
                    this._modifiedSources.add(source.path);
                }
            }
            if (keepUnverified) {
                var message = localize(24, null);
                for (var _d = 0, sbs_1 = sbs; _d < sbs_1.length; _d++) {
                    var ibp = sbs_1[_d];
                    ibp.verificationMessage = message;
                }
            }
        }
        if (source.adapterData) {
            if (source.adapterData.inlinePath) {
                // a breakpoint in inlined source: we need to source map
                this._mapSourceAndUpdateBreakpoints(response, source.adapterData.inlinePath, sbs);
                return;
            }
            if (source.adapterData.remotePath) {
                // a breakpoint in a remote file: don't try to source map
                this._updateBreakpoints(response, source.adapterData.remotePath, -1, sbs);
                return;
            }
        }
        if (typeof source.sourceReference === 'number' && source.sourceReference > 0) {
            var srcSource = this._sourceHandles.get(source.sourceReference);
            if (srcSource && srcSource.scriptId) {
                this._updateBreakpoints(response, null, srcSource.scriptId, sbs);
                return;
            }
        }
        if (source.path) {
            var path = this.convertClientPathToDebugger(source.path);
            this._mapSourceAndUpdateBreakpoints(response, path, sbs);
            return;
        }
        if (source.name) {
            // a core module
            this._findModule(source.name).then(function (scriptId) {
                if (scriptId >= 0) {
                    _this._updateBreakpoints(response, null, scriptId, sbs);
                }
                else {
                    _this.sendErrorResponse(response, 2019, localize(25, null, '{_module}'), { _module: source.name });
                }
                return;
            });
            return;
        }
        this.sendErrorResponse(response, 2012, 'No valid source specified.', null, vscode_debugadapter_1.ErrorDestination.Telemetry);
    };
    NodeDebugSession.prototype._mapSourceAndUpdateBreakpoints = function (response, path, lbs) {
        var _this = this;
        var generated = '';
        Promise.resolve(generated).then(function (generated) {
            if (_this._sourceMaps) {
                return _this._sourceMaps.MapPathFromSource(path);
            }
            return generated;
        }).then(function (generated) {
            if (PathUtils.pathCompare(generated, path)) {
                _this.log('bp', "_mapSourceAndUpdateBreakpoints: source and generated are same -> ignore sourcemap");
                generated = '';
            }
            if (generated) {
                // source map line numbers
                Promise.all(lbs.map(function (lbrkpt) { return _this._sourceMaps.MapFromSource(path, lbrkpt.line, lbrkpt.column); })).then(function (mapResults) {
                    for (var i = 0; i < lbs.length; i++) {
                        var lb = lbs[i];
                        var mapresult = mapResults[i];
                        if (mapresult) {
                            _this.log('sm', "_mapSourceAndUpdateBreakpoints: src: '" + path + "' " + lb.line + ":" + lb.column + " -> gen: '" + mapresult.path + "' " + mapresult.line + ":" + mapresult.column);
                            if (mapresult.path !== generated) {
                                // this source line maps to a different destination file -> this is not supported, ignore breakpoint by setting line to -1
                                lb.line = -1;
                            }
                            else {
                                lb.line = mapresult.line;
                                lb.column = mapresult.column;
                            }
                        }
                        else {
                            _this.log('sm', "_mapSourceAndUpdateBreakpoints: src: '" + path + "' " + lb.line + ":" + lb.column + " -> gen: couldn't be mapped; breakpoint ignored");
                            lb.line = -1;
                        }
                    }
                    path = generated;
                    path = _this._localToRemote(path);
                    _this._updateBreakpoints(response, path, -1, lbs, true);
                });
                return;
            }
            if (!NodeDebugSession.isJavaScript(path)) {
                // ignore all breakpoints for this source
                for (var _i = 0, lbs_1 = lbs; _i < lbs_1.length; _i++) {
                    var lb = lbs_1[_i];
                    lb.line = -1;
                }
            }
            // try to convert local path to remote path
            path = _this._localToRemote(path);
            _this._updateBreakpoints(response, path, -1, lbs, false);
        });
    };
    /*
     * clear and set all breakpoints of a given source.
     */
    NodeDebugSession.prototype._updateBreakpoints = function (response, path, scriptId, lbs, sourcemap) {
        var _this = this;
        if (sourcemap === void 0) { sourcemap = false; }
        // clear all existing breakpoints for the given path or script ID
        this._node.listBreakpoints().then(function (nodeResponse) {
            var toClear = new Array();
            var path_regexp = _this._pathToRegexp(path);
            // try to match breakpoints
            for (var _i = 0, _a = nodeResponse.body.breakpoints; _i < _a.length; _i++) {
                var breakpoint = _a[_i];
                switch (breakpoint.type) {
                    case 'scriptId':
                        if (scriptId === breakpoint.script_id) {
                            toClear.push(breakpoint.number);
                        }
                        break;
                    case 'scriptRegExp':
                        if (path_regexp === breakpoint.script_regexp) {
                            toClear.push(breakpoint.number);
                        }
                        break;
                }
            }
            return _this._clearBreakpoints(toClear);
        }).then(function () {
            return Promise.all(lbs.map(function (bp) { return _this._setBreakpoint(scriptId, path, bp, sourcemap); }));
        }).then(function (result) {
            response.body = {
                breakpoints: result
            };
            _this.sendResponse(response);
            _this.log('bp', "_updateBreakpoints: result " + JSON.stringify(result));
        }).catch(function (nodeResponse) {
            _this._sendNodeResponse(response, nodeResponse);
        });
    };
    /*
     * Clear breakpoints by their ids.
     */
    NodeDebugSession.prototype._clearBreakpoints = function (ids) {
        var _this = this;
        return Promise.all(ids.map(function (id) { return _this._node.clearBreakpoint({ breakpoint: id }); })).then(function (response) {
            return;
        }).catch(function (err) {
            return; // ignore errors
        });
    };
    /*
     * register a single breakpoint with node.
     */
    NodeDebugSession.prototype._setBreakpoint = function (scriptId, path, lb, sourcemap) {
        var _this = this;
        if (lb.line < 0) {
            // ignore this breakpoint because it couldn't be source mapped successfully
            var bp = new vscode_debugadapter_1.Breakpoint(false);
            bp.message = localize(26, null);
            return Promise.resolve(bp);
        }
        if (lb.line === 0) {
            lb.column += NodeDebugSession.FIRST_LINE_OFFSET;
        }
        var args;
        if (scriptId > 0) {
            args = {
                type: 'scriptId',
                target: scriptId,
                line: lb.line,
                column: lb.column,
                condition: lb.condition
            };
        }
        else {
            args = {
                type: 'scriptRegExp',
                target: this._pathToRegexp(path),
                line: lb.line,
                column: lb.column,
                condition: lb.condition
            };
        }
        return this._node.setBreakpoint(args).then(function (resp) {
            _this.log('bp', "_setBreakpoint: " + JSON.stringify(args));
            if (lb.hitter) {
                _this._hitCounts.set(resp.body.breakpoint, lb);
            }
            var actualLine = args.line;
            var actualColumn = args.column;
            var al = resp.body.actual_locations;
            if (al.length > 0) {
                actualLine = al[0].line;
                actualColumn = _this._adjustColumn(actualLine, al[0].column);
            }
            if (path && sourcemap) {
                if (actualLine !== args.line || actualColumn !== args.column) {
                    // breakpoint location was adjusted by node.js so we have to map the new location back to source
                    // first try to map the remote path back to local
                    var localpath_1 = _this._remoteToLocal(path);
                    // then try to map js locations back to source locations
                    return _this._sourceMaps.MapToSource(localpath_1, null, actualLine, actualColumn).then(function (mapresult) {
                        if (mapresult) {
                            _this.log('sm', "_setBreakpoint: bp verification gen: '" + localpath_1 + "' " + actualLine + ":" + actualColumn + " -> src: '" + mapresult.path + "' " + mapresult.line + ":" + mapresult.column);
                            actualLine = mapresult.line;
                            actualColumn = mapresult.column;
                        }
                        else {
                            actualLine = lb.orgLine;
                            actualColumn = lb.orgColumn;
                        }
                        return _this._setBreakpoint2(lb, path, actualLine, actualColumn);
                    });
                }
                else {
                    actualLine = lb.orgLine;
                    actualColumn = lb.orgColumn;
                }
            }
            return _this._setBreakpoint2(lb, path, actualLine, actualColumn);
        }).catch(function (error) {
            return new vscode_debugadapter_1.Breakpoint(false);
        });
    };
    NodeDebugSession.prototype._setBreakpoint2 = function (ibp, path, actualLine, actualColumn) {
        // nasty corner case: since we ignore the break-on-entry event we have to make sure that we
        // stop in the entry point line if the user has an explicit breakpoint there (or if there is a 'debugger' statement).
        // For this we check here whether a breakpoint is at the same location as the 'break-on-entry' location.
        // If yes, then we plan for hitting the breakpoint instead of 'continue' over it!
        if (!this._stopOnEntry && path && PathUtils.pathCompare(this._entryPath, path)) {
            if (this._entryLine === actualLine && this._entryColumn === actualColumn) {
                // we do not have to 'continue' but we have to generate a stopped event instead
                this._needContinue = false;
                this._needBreakpointEvent = true;
                this.log('la', '_setBreakpoint2: remember to fire a breakpoint event later');
            }
        }
        if (ibp.verificationMessage) {
            var bp = new vscode_debugadapter_1.Breakpoint(false, this.convertDebuggerLineToClient(actualLine), this.convertDebuggerColumnToClient(actualColumn));
            bp.message = ibp.verificationMessage;
            return bp;
        }
        else {
            return new vscode_debugadapter_1.Breakpoint(true, this.convertDebuggerLineToClient(actualLine), this.convertDebuggerColumnToClient(actualColumn));
        }
    };
    /**
     * converts a path into a regular expression for use in the setbreakpoint request
     */
    NodeDebugSession.prototype._pathToRegexp = function (path) {
        if (!path) {
            return path;
        }
        var escPath = path.replace(/([/\\.?*()^${}|[\]])/g, '\\$1');
        // check for drive letter
        if (/^[a-zA-Z]:\\/.test(path)) {
            var u = escPath.substring(0, 1).toUpperCase();
            var l = u.toLowerCase();
            escPath = '[' + l + u + ']' + escPath.substring(1);
        }
        /*
        // support case-insensitive breakpoint paths
        const escPathUpper = escPath.toUpperCase();
        const escPathLower = escPath.toLowerCase();
        escPath = '';
        for (var i = 0; i < escPathUpper.length; i++) {
            const u = escPathUpper[i];
            const l = escPathLower[i];
            if (u === l) {
                escPath += u;
            } else {
                escPath += '[' + l + u + ']';
            }
        }
        */
        var pathRegex = '^(.*[\\/\\\\])?' + escPath + '$'; // skips drive letters
        return pathRegex;
    };
    //--- set function breakpoints request ------------------------------------------------------------------------------------
    NodeDebugSession.prototype.setFunctionBreakPointsRequest = function (response, args) {
        var _this = this;
        // clear all existing function breakpoints
        this._clearBreakpoints(this._functionBreakpoints).then(function () {
            _this._functionBreakpoints.length = 0; // clear array
            // set new function breakpoints
            return Promise.all(args.breakpoints.map(function (functionBreakpoint) { return _this._setFunctionBreakpoint(functionBreakpoint); }));
        }).then(function (results) {
            response.body = {
                breakpoints: results
            };
            _this.sendResponse(response);
            _this.log('bp', "setFunctionBreakPointsRequest: result " + JSON.stringify(results));
        }).catch(function (nodeResponse) {
            _this._sendNodeResponse(response, nodeResponse);
        });
    };
    /*
     * Register a single function breakpoint with node.
     * Returns verification info about the breakpoint.
     */
    NodeDebugSession.prototype._setFunctionBreakpoint = function (functionBreakpoint) {
        var _this = this;
        var args = {
            type: 'function',
            target: functionBreakpoint.name
        };
        if (functionBreakpoint.condition) {
            args.condition = functionBreakpoint.condition;
        }
        return this._node.setBreakpoint(args).then(function (resp) {
            _this._functionBreakpoints.push(resp.body.breakpoint); // remember function breakpoint ids
            var locations = resp.body.actual_locations;
            if (locations && locations.length > 0) {
                var actualLine = _this.convertDebuggerLineToClient(locations[0].line);
                var actualColumn = _this.convertDebuggerColumnToClient(_this._adjustColumn(actualLine, locations[0].column));
                return new vscode_debugadapter_1.Breakpoint(true, actualLine, actualColumn); // TODO@AW add source
            }
            else {
                return new vscode_debugadapter_1.Breakpoint(true);
            }
        }).catch(function (resp) {
            return {
                verified: false,
                message: resp.message
            };
        });
    };
    //--- set exception request -----------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.setExceptionBreakPointsRequest = function (response, args) {
        var _this = this;
        this.log('bp', "setExceptionBreakPointsRequest: " + JSON.stringify(args.filters));
        var nodeArgs = {
            type: 'all',
            enabled: false
        };
        this._catchRejects = false;
        var filters = args.filters;
        if (filters) {
            if (filters.indexOf('all') >= 0) {
                nodeArgs.enabled = true;
                this._catchRejects = true;
            }
            else if (filters.indexOf('uncaught') >= 0) {
                nodeArgs.type = 'uncaught';
                nodeArgs.enabled = true;
            }
        }
        this._node.setExceptionBreak(nodeArgs).then(function (nodeResponse) {
            _this.sendResponse(response);
        }).catch(function (err) {
            _this.sendErrorResponse(response, 2024, 'Configuring exception break options failed ({_nodeError}).', { _nodeError: err.message }, vscode_debugadapter_1.ErrorDestination.Telemetry);
        });
    };
    //--- configuration done request ------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.configurationDoneRequest = function (response, args) {
        // all breakpoints are configured now -> start debugging
        var info = 'nothing to do';
        if (this._needContinue) {
            this._needContinue = false;
            info = 'do a \'Continue\'';
            this._node.command('continue');
        }
        if (this._needBreakpointEvent) {
            this._needBreakpointEvent = false;
            info = 'fire breakpoint event';
            this.sendEvent(new vscode_debugadapter_1.StoppedEvent(this._reasonText('breakpoint'), NodeDebugSession.DUMMY_THREAD_ID));
        }
        if (this._needDebuggerEvent) {
            this._needDebuggerEvent = false;
            info = 'fire debugger statement event';
            this.sendEvent(new vscode_debugadapter_1.StoppedEvent(this._reasonText('debugger'), NodeDebugSession.DUMMY_THREAD_ID));
        }
        this.log('la', "configurationDoneRequest: " + info);
        this.sendResponse(response);
    };
    //--- threads request -----------------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.threadsRequest = function (response) {
        var _this = this;
        this._node.command('threads', null, function (nodeResponse) {
            var threads = new Array();
            if (nodeResponse.success) {
                var ths = nodeResponse.body.threads;
                if (ths) {
                    for (var _i = 0, ths_1 = ths; _i < ths_1.length; _i++) {
                        var thread = ths_1[_i];
                        var id = thread.id;
                        if (id >= 0) {
                            threads.push(new vscode_debugadapter_1.Thread(id, "Thread (id: " + id + ")"));
                        }
                    }
                }
            }
            if (threads.length === 0) {
                var name_1 = NodeDebugSession.DUMMY_THREAD_NAME;
                if (_this._nodeProcessId > 0 && _this._node.hostVersion) {
                    name_1 = name_1 + " (" + _this._nodeProcessId + ", " + _this._node.hostVersion + ")";
                }
                else if (_this._nodeProcessId > 0) {
                    name_1 = name_1 + " (" + _this._nodeProcessId + ")";
                }
                else if (_this._node.hostVersion) {
                    name_1 = name_1 + " (" + _this._node.hostVersion + ")";
                }
                threads.push(new vscode_debugadapter_1.Thread(NodeDebugSession.DUMMY_THREAD_ID, name_1));
            }
            response.body = {
                threads: threads
            };
            _this.sendResponse(response);
        });
    };
    //--- stacktrace request --------------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.stackTraceRequest = function (response, args) {
        var _this = this;
        var threadReference = args.threadId;
        var startFrame = typeof args.startFrame === 'number' ? args.startFrame : 0;
        var maxLevels = args.levels;
        var totalFrames = 0;
        if (threadReference !== NodeDebugSession.DUMMY_THREAD_ID) {
            this.sendErrorResponse(response, 2014, 'Unexpected thread reference {_thread}.', { _thread: threadReference }, vscode_debugadapter_1.ErrorDestination.Telemetry);
            return;
        }
        var backtraceArgs = {
            fromFrame: startFrame,
            toFrame: startFrame + maxLevels
        };
        var cmd = this._nodeInjectionAvailable ? 'vscode_backtrace' : 'backtrace';
        this.log('va', "stackTraceRequest: " + cmd + " " + startFrame + " " + maxLevels);
        this._node.command2(cmd, backtraceArgs).then(function (response) {
            if (response.body.totalFrames > 0 || response.body.frames) {
                var frames_1 = response.body.frames;
                totalFrames = response.body.totalFrames;
                return Promise.all(frames_1.map(function (frame) { return _this._createStackFrame(frame); }));
            }
            else {
                throw new Error('no stack');
            }
        }).then(function (stackframes) {
            response.body = {
                stackFrames: stackframes,
                totalFrames: totalFrames
            };
            _this.sendResponse(response);
        }).catch(function (error) {
            if (error.message === 'no stack') {
                if (_this._stoppedReason === 'pause') {
                    _this.sendErrorResponse(response, 2022, localize(27, null));
                }
                else {
                    _this.sendErrorResponse(response, 2023, localize(28, null));
                }
            }
            else {
                _this.sendErrorResponse(response, 2018, localize(29, null), { _command: error.command, _error: error.message });
            }
        });
    };
    /**
     * Create a single stack frame.
     */
    NodeDebugSession.prototype._createStackFrame = function (frame) {
        var _this = this;
        // resolve some refs
        return this._resolveValues([frame.script, frame.func, frame.receiver]).then(function () {
            var line = frame.line;
            var column = _this._adjustColumn(line, frame.column);
            var src;
            var origin = localize(30, null);
            var script_val = _this._getValueFromCache(frame.script);
            if (script_val) {
                var name_2 = script_val.name;
                if (name_2) {
                    if (_this._mapToFilesOnDisk) {
                        // try to map the script to a file in the workspace
                        // first convert urls to paths
                        var u = URL.parse(name_2);
                        if (u.protocol === 'file:' && u.path) {
                            // a local file path
                            name_2 = decodeURI(u.path);
                        }
                        // we can only map absolute paths
                        if (PathUtils.isAbsolutePath(name_2)) {
                            // with remote debugging path might come from a different OS
                            var remotePath_1 = name_2;
                            // if launch.json defines localRoot and remoteRoot try to convert remote path back to a local path
                            var localPath_1 = _this._remoteToLocal(remotePath_1);
                            if (localPath_1 !== remotePath_1 && _this._attachMode) {
                                // assume attached to remote node process
                                origin = localize(31, null);
                            }
                            // source mapping is enabled
                            if (_this._sourceMaps) {
                                // load script to find source reference
                                return _this._loadScript(script_val.id).then(function (script) {
                                    return _this._createStackFrameFromSourceMap(frame, script.contents, name_2, localPath_1, remotePath_1, origin, line, column);
                                });
                            }
                            return _this._createStackFrameFromPath(frame, name_2, localPath_1, remotePath_1, origin, line, column);
                        }
                        // if we end up here, 'name' is not a path and is an internal module
                        origin = localize(32, null);
                    }
                    else {
                    }
                }
                if (!name_2) {
                    // if a function is dynamically created from a string, its script has no name.
                    name_2 = "VM" + script_val.id;
                }
                // source not found locally -> prepare to stream source content from node backend.
                var sourceHandle = _this._getScriptIdHandle(script_val.id);
                src = new vscode_debugadapter_1.Source(name_2, undefined, sourceHandle, origin);
            }
            return _this._createStackFrameFromSource(frame, src, line, column);
        }).catch(function (err) {
            var func_name = _this._getFrameName(frame);
            var name = localize(33, null, func_name, err.message);
            return new vscode_debugadapter_1.StackFrame(_this._frameHandles.create(frame), name);
        });
    };
    /**
     * Creates a StackFrame when source maps are involved.
     */
    NodeDebugSession.prototype._createStackFrameFromSourceMap = function (frame, content, name, localPath, remotePath, origin, line, column) {
        var _this = this;
        return this._sourceMaps.MapToSource(localPath, content, line, column).then(function (mapresult) {
            if (mapresult) {
                _this.log('sm', "_createStackFrameFromSourceMap: gen: '" + localPath + "' " + line + ":" + column + " -> src: '" + mapresult.path + "' " + mapresult.line + ":" + mapresult.column);
                return _this._sameFile(mapresult.path, _this._compareContents, 0, mapresult.content).then(function (same) {
                    if (same) {
                        // use this mapping
                        var src = new vscode_debugadapter_1.Source(Path.basename(mapresult.path), _this.convertDebuggerPathToClient(mapresult.path));
                        return _this._createStackFrameFromSource(frame, src, mapresult.line, mapresult.column);
                    }
                    // file doesn't exist at path: if source map has inlined source use it
                    if (mapresult.content) {
                        _this.log('sm', "_createStackFrameFromSourceMap: source '" + mapresult.path + "' doesn't exist -> use inlined source");
                        var sourceHandle = _this._getInlinedContentHandle(mapresult.content);
                        origin = localize(34, null);
                        var src = new vscode_debugadapter_1.Source(Path.basename(mapresult.path), undefined, sourceHandle, origin, { inlinePath: mapresult.path });
                        return _this._createStackFrameFromSource(frame, src, mapresult.line, mapresult.column);
                    }
                    _this.log('sm', "_createStackFrameFromSourceMap: gen: '" + localPath + "' " + line + ":" + column + " -> can't find source -> use generated file");
                    return _this._createStackFrameFromPath(frame, name, localPath, remotePath, origin, line, column);
                });
            }
            _this.log('sm', "_createStackFrameFromSourceMap: gen: '" + localPath + "' " + line + ":" + column + " -> couldn't be mapped to source -> use generated file");
            return _this._createStackFrameFromPath(frame, name, localPath, remotePath, origin, line, column);
        });
    };
    NodeDebugSession.prototype._getInlinedContentHandle = function (content) {
        var handle = this._inlinedContentHandle.get(content);
        if (!handle) {
            handle = this._sourceHandles.create(new SourceSource(0, content));
            this._inlinedContentHandle.set(content, handle);
        }
        return handle;
    };
    /**
     * Creates a StackFrame from the given local path.
     * The remote path is used if the local path doesn't exist.
     */
    NodeDebugSession.prototype._createStackFrameFromPath = function (frame, name, localPath, remotePath, origin, line, column) {
        var _this = this;
        var script_val = this._getValueFromCache(frame.script);
        var script_id = script_val.id;
        return this._sameFile(localPath, this._compareContents, script_id).then(function (same) {
            var src;
            if (same) {
                // we use the file on disk
                src = new vscode_debugadapter_1.Source(name, _this.convertDebuggerPathToClient(localPath));
            }
            else {
                // we use the script's content streamed from node
                var sourceHandle = _this._getScriptIdHandle(script_id);
                src = new vscode_debugadapter_1.Source(name, undefined, sourceHandle, origin, { remotePath: remotePath }); // assume it is a remote path
            }
            return _this._createStackFrameFromSource(frame, src, line, column);
        });
    };
    NodeDebugSession.prototype._getScriptIdHandle = function (scriptId) {
        var handle = this._scriptId2Handle.get(scriptId);
        if (!handle) {
            handle = this._sourceHandles.create(new SourceSource(scriptId));
            this._scriptId2Handle.set(scriptId, handle);
        }
        return handle;
    };
    /**
     * Creates a StackFrame with the given source location information.
     * The name of the frame is extracted from the frame.
     */
    NodeDebugSession.prototype._createStackFrameFromSource = function (frame, src, line, column) {
        var name = this._getFrameName(frame);
        var frameReference = this._frameHandles.create(frame);
        return new vscode_debugadapter_1.StackFrame(frameReference, name, src, this.convertDebuggerLineToClient(line), this.convertDebuggerColumnToClient(column));
    };
    NodeDebugSession.prototype._getFrameName = function (frame) {
        var func_name;
        var func_val = this._getValueFromCache(frame.func);
        if (func_val) {
            func_name = func_val.inferredName;
            if (!func_name || func_name.length === 0) {
                func_name = func_val.name;
            }
        }
        if (!func_name || func_name.length === 0) {
            func_name = localize(35, null);
        }
        return func_name;
    };
    /**
     * Returns true if a file exists at path.
     * If compareContents is true and a script_id is given, _sameFile verifies that the
     * file's content matches the script's content.
     */
    NodeDebugSession.prototype._sameFile = function (path, compareContents, script_id, content) {
        var _this = this;
        return this._existsFile(path).then(function (exists) {
            if (exists) {
                if (compareContents && (script_id || content)) {
                    return Promise.all([
                        _this._readFile(path),
                        content
                            ? Promise.resolve(content)
                            : _this._loadScript(script_id).then(function (script) { return script.contents; })
                    ]).then(function (results) {
                        var fileContents = results[0];
                        var contents = results[1];
                        // remove an optional shebang
                        fileContents = fileContents.replace(/^#!.*\n/, '');
                        // try to locate the file contents in the executed contents
                        var pos = contents.indexOf(fileContents);
                        return pos >= 0;
                    }).catch(function (err) {
                        return false;
                    });
                }
                return true;
            }
            return false;
        });
    };
    /**
     * Returns (and caches) the file contents of path.
     */
    NodeDebugSession.prototype._readFile = function (path) {
        path = PathUtils.normalizeDriveLetter(path);
        var file = this._files.get(path);
        if (!file) {
            this.log('ls', "__readFile: " + path);
            file = new Promise(function (completeDispatch, errorDispatch) {
                FS.readFile(path, 'utf8', function (err, fileContents) {
                    if (err) {
                        errorDispatch(err);
                    }
                    else {
                        completeDispatch(fileContents);
                    }
                });
            });
            this._files.set(path, file);
        }
        return file;
    };
    /**
     * a Promise based version of 'exists'
     */
    NodeDebugSession.prototype._existsFile = function (path) {
        return new Promise(function (completeDispatch, errorDispatch) {
            FS.exists(path, completeDispatch);
        });
    };
    NodeDebugSession.prototype.scopesRequest = function (response, args) {
        var _this = this;
        var frame = this._frameHandles.get(args.frameId);
        if (!frame) {
            this.sendErrorResponse(response, 2020, 'stack frame not valid', null, vscode_debugadapter_1.ErrorDestination.Telemetry);
            return;
        }
        var frameIx = frame.index;
        var frameThis = this._getValueFromCache(frame.receiver);
        var scopesArgs = {
            frame_index: frameIx,
            frameNumber: frameIx
        };
        var cmd = 'scopes';
        if (this._nodeInjectionAvailable) {
            cmd = 'vscode_scopes';
            scopesArgs.maxLocals = this._maxVariablesPerScope;
        }
        this.log('va', "scopesRequest: scope " + frameIx);
        this._node.command2(cmd, scopesArgs).then(function (scopesResponse) {
            var scopes = scopesResponse.body.scopes;
            return Promise.all(scopes.map(function (scope) {
                var type = scope.type;
                var extra = type === 1 ? frameThis : undefined;
                var expensive = type === 0; // global scope is expensive
                var scopeName;
                if (type >= 0 && type < NodeDebugSession.SCOPE_NAMES.length) {
                    if (type === 1 && typeof scopesResponse.body.vscode_locals === 'number') {
                        expensive = true;
                        scopeName = localize(36, null, scopesArgs.maxLocals, scopesResponse.body.vscode_locals);
                    }
                    else {
                        scopeName = NodeDebugSession.SCOPE_NAMES[type];
                    }
                }
                else {
                    scopeName = localize(37, null, type);
                }
                return _this._resolveValues([scope.object]).then(function (resolved) {
                    return new vscode_debugadapter_1.Scope(scopeName, _this._variableHandles.create(new ScopeContainer(scope, resolved[0], extra)), expensive);
                }).catch(function (error) {
                    return new vscode_debugadapter_1.Scope(scopeName, 0);
                });
            }));
        }).then(function (scopes) {
            // exception scope
            if (frameIx === 0 && _this._exception) {
                scopes.unshift(new vscode_debugadapter_1.Scope(localize(38, null), _this._variableHandles.create(new PropertyContainer(_this._exception))));
            }
            response.body = {
                scopes: scopes
            };
            _this.sendResponse(response);
        }).catch(function (error) {
            // in case of error return empty scopes array
            response.body = { scopes: [] };
            _this.sendResponse(response);
        });
    };
    //--- variables request ---------------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.variablesRequest = function (response, args) {
        var _this = this;
        var reference = args.variablesReference;
        var variablesContainer = this._variableHandles.get(reference);
        if (variablesContainer) {
            var filter = (args.filter === 'indexed' || args.filter === 'named') ? args.filter : 'all';
            variablesContainer.Expand(this, filter, args.start, args.count).then(function (variables) {
                variables.sort(NodeDebugSession.compareVariableNames);
                response.body = {
                    variables: variables
                };
                _this.sendResponse(response);
            }).catch(function (err) {
                // in case of error return empty variables array
                response.body = {
                    variables: []
                };
                _this.sendResponse(response);
            });
        }
        else {
            // no container found: return empty variables array
            response.body = {
                variables: []
            };
            this.sendResponse(response);
        }
    };
    /*
     * Returns indexed or named properties for the given structured object as a variables array.
     * There are three modes:
     * 'all': add all properties (indexed and named)
     * 'indexed': add 'count' indexed properties starting at 'start'
     * 'named': add only the named properties.
     */
    NodeDebugSession.prototype._createProperties = function (obj, mode, start, count) {
        var _this = this;
        if (start === void 0) { start = 0; }
        if (obj && !obj.properties) {
            // if properties are missing, this is an indication that we are running injected code which doesn't return the properties for large objects
            if (this._nodeInjectionAvailable) {
                var handle = obj.handle;
                if (typeof obj.vscode_indexedCnt === 'number' && typeof handle === 'number' && handle !== 0) {
                    if (count === undefined) {
                        count = obj.vscode_indexedCnt;
                    }
                    var args = { handle: handle, mode: mode, start: start, count: count };
                    return this._node.command2('vscode_slice', args).then(function (resp) {
                        var items = resp.body.result;
                        return Promise.all(items.map(function (item) {
                            return _this._createVariable(item.name, item.value);
                        }));
                    });
                }
            }
            // if we end up here, something went wrong...
            return Promise.resolve([]);
        }
        var selectedProperties = new Array();
        var found_proto = false;
        if (obj.properties) {
            for (var _i = 0, _a = obj.properties; _i < _a.length; _i++) {
                var property = _a[_i];
                if ('name' in property) {
                    var name_3 = property.name;
                    if (name_3 === NodeDebugSession.PROTO) {
                        found_proto = true;
                    }
                    switch (mode) {
                        case 'all':
                            selectedProperties.push(property);
                            break;
                        case 'named':
                            if (!isIndex(name_3)) {
                                selectedProperties.push(property);
                            }
                            break;
                        case 'indexed':
                            if (isIndex(name_3)) {
                                var ix = +name_3;
                                if (ix >= start && ix < start + count) {
                                    selectedProperties.push(property);
                                }
                            }
                            break;
                    }
                }
            }
        }
        // do we have to add the protoObject to the list of properties?
        if (!found_proto && (mode === 'all' || mode === 'named')) {
            var h = obj.handle;
            if (h > 0) {
                obj.protoObject.name = NodeDebugSession.PROTO;
                selectedProperties.push(obj.protoObject);
            }
        }
        return this._createPropertyVariables(obj, selectedProperties);
    };
    /**
     * Resolves the given properties and returns them as an array of Variables.
     * If the properties are indexed (opposed to named), a value 'start' is added to the index number.
     * If a value is undefined it probes for a getter.
     */
    NodeDebugSession.prototype._createPropertyVariables = function (obj, properties, doPreview, start) {
        var _this = this;
        if (doPreview === void 0) { doPreview = true; }
        if (start === void 0) { start = 0; }
        return this._resolveValues(properties).then(function () {
            return Promise.all(properties.map(function (property) {
                var val = _this._getValueFromCache(property);
                // create 'name'
                var name;
                if (isIndex(property.name)) {
                    var ix = +property.name;
                    name = "" + (start + ix);
                }
                else {
                    name = property.name;
                }
                // if value 'undefined' trigger a getter
                if (_this._node.v8Version && val.type === 'undefined' && !val.value && obj) {
                    var args = {
                        expression: "obj['" + name + "']",
                        additional_context: [
                            { name: 'obj', handle: obj.handle }
                        ],
                        disable_break: true,
                        maxStringLength: NodeDebugSession.MAX_STRING_LENGTH
                    };
                    _this.log('va', "_createPropertyVariables: trigger getter");
                    return _this._node.evaluate(args).then(function (response) {
                        return _this._createVariable(name, response.body, doPreview);
                    }).catch(function (err) {
                        return new vscode_debugadapter_1.Variable(name, 'undefined');
                    });
                }
                else {
                    return _this._createVariable(name, val, doPreview);
                }
            }));
        });
    };
    /**
     * Create a Variable with the given name and value.
     * For structured values the variable object will have a corresponding expander.
     */
    NodeDebugSession.prototype._createVariable = function (name, val, doPreview) {
        var _this = this;
        if (doPreview === void 0) { doPreview = true; }
        if (!val) {
            return Promise.resolve(null);
        }
        var simple = val;
        switch (val.type) {
            case 'undefined':
            case 'null':
                return Promise.resolve(new vscode_debugadapter_1.Variable(name, val.type));
            case 'string':
                return this._createStringVariable(name, val, doPreview ? undefined : NodeDebugSession.PREVIEW_MAX_STRING_LENGTH);
            case 'number':
                if (typeof simple.value === 'number') {
                    return Promise.resolve(new vscode_debugadapter_1.Variable(name, simple.value.toString()));
                }
                break;
            case 'boolean':
                if (typeof simple.value === 'boolean') {
                    return Promise.resolve(new vscode_debugadapter_1.Variable(name, simple.value.toString().toLowerCase())); // node returns these boolean values capitalized
                }
                break;
            case 'set':
            case 'map':
                if (this._node.v8Version) {
                    return this._createSetMapVariable(name, val);
                }
            // fall through and treat sets and maps as objects
            case 'object':
            case 'function':
            case 'regexp':
            case 'promise':
            case 'generator':
            case 'error':
                var object_1 = val;
                var value_1 = object_1.className;
                switch (value_1) {
                    case 'Array':
                    case 'ArrayBuffer':
                    case 'Int8Array':
                    case 'Uint8Array':
                    case 'Uint8ClampedArray':
                    case 'Int16Array':
                    case 'Uint16Array':
                    case 'Int32Array':
                    case 'Uint32Array':
                    case 'Float32Array':
                    case 'Float64Array':
                        return this._createArrayVariable(name, val, doPreview);
                    case 'RegExp':
                        if (typeof object_1.text === 'string') {
                            return Promise.resolve(new vscode_debugadapter_1.Variable(name, object_1.text, this._variableHandles.create(new PropertyContainer(val))));
                        }
                        break;
                    case 'Generator':
                    case 'Object':
                        return this._resolveValues(object_1.constructorFunction ? [object_1.constructorFunction] : []).then(function (resolved) {
                            if (resolved.length > 0 && resolved[0]) {
                                var constructor_name = resolved[0].name;
                                if (constructor_name) {
                                    value_1 = constructor_name;
                                }
                            }
                            if (val.type === 'promise' || val.type === 'generator') {
                                if (object_1.status) {
                                    value_1 += " { " + object_1.status + " }";
                                }
                            }
                            else {
                                if (object_1.properties) {
                                    return _this._objectPreview(object_1, doPreview).then(function (preview) {
                                        if (preview) {
                                            value_1 = value_1 + " " + preview;
                                        }
                                        return new vscode_debugadapter_1.Variable(name, value_1, _this._variableHandles.create(new PropertyContainer(val)));
                                    });
                                }
                            }
                            return new vscode_debugadapter_1.Variable(name, value_1, _this._variableHandles.create(new PropertyContainer(val)));
                        });
                    //break;
                    case 'Function':
                    case 'Error':
                    default:
                        if (object_1.text) {
                            var text = object_1.text;
                            if (text.indexOf('\n') >= 0) {
                                // replace body of function with '...'
                                var pos = text.indexOf('{');
                                if (pos > 0) {
                                    text = text.substring(0, pos) + '{ … }';
                                }
                            }
                            value_1 = text;
                        }
                        break;
                }
                return Promise.resolve(new vscode_debugadapter_1.Variable(name, value_1, this._variableHandles.create(new PropertyContainer(val))));
            case 'frame':
            default:
                break;
        }
        return Promise.resolve(new vscode_debugadapter_1.Variable(name, simple.value ? simple.value.toString() : 'undefined'));
    };
    /**
     * creates something like this: {a: 123, b: "hi", c: true …}
     */
    NodeDebugSession.prototype._objectPreview = function (object, doPreview) {
        if (doPreview && object && object.properties && object.properties.length > 0) {
            var propcnt_1 = object.properties.length;
            return this._createPropertyVariables(object, object.properties.slice(0, NodeDebugSession.PREVIEW_PROPERTIES), false).then(function (props) {
                var preview = '{';
                for (var i = 0; i < props.length; i++) {
                    preview += props[i].name + ": " + props[i].value;
                    if (i < props.length - 1) {
                        preview += ', ';
                    }
                    else {
                        if (propcnt_1 > NodeDebugSession.PREVIEW_PROPERTIES) {
                            preview += ' …';
                        }
                    }
                }
                preview += '}';
                return preview;
            });
        }
        return Promise.resolve(null);
    };
    /**
     * creates something like this: [ 1, 2, 3 …]
     */
    NodeDebugSession.prototype._arrayPreview = function (array, length, doPreview) {
        if (doPreview && array && array.properties && length > 0) {
            var previewProps = new Array();
            for (var i = 0; i < array.properties.length; i++) {
                var p = array.properties[i];
                if (isIndex(p.name)) {
                    var ix = +p.name;
                    if (ix >= 0 && ix < NodeDebugSession.PREVIEW_PROPERTIES) {
                        previewProps.push(p);
                        if (previewProps.length >= NodeDebugSession.PREVIEW_PROPERTIES) {
                            break;
                        }
                    }
                }
            }
            return this._createPropertyVariables(array, previewProps, false).then(function (props) {
                var preview = '[';
                for (var i = 0; i < props.length; i++) {
                    preview += "" + props[i].value;
                    if (i < props.length - 1) {
                        preview += ', ';
                    }
                    else {
                        if (length > NodeDebugSession.PREVIEW_PROPERTIES) {
                            preview += ' …';
                        }
                    }
                }
                preview += ']';
                return preview;
            });
        }
        return Promise.resolve(null);
    };
    //--- long array support
    NodeDebugSession.prototype._createArrayVariable = function (name, array, doPreview) {
        var _this = this;
        return this._getArraySize(array).then(function (pair) {
            var indexedSize = 0;
            var namedSize = 0;
            var arraySize = '';
            if (pair.length >= 2) {
                indexedSize = pair[0];
                namedSize = pair[1];
                arraySize = indexedSize.toString();
            }
            return _this._arrayPreview(array, indexedSize, doPreview).then(function (preview) {
                var v = array.className + "[" + arraySize + "]";
                if (preview) {
                    v = v + " " + preview;
                }
                return new vscode_debugadapter_1.Variable(name, v, _this._variableHandles.create(new PropertyContainer(array)), indexedSize, namedSize);
            });
        });
    };
    NodeDebugSession.prototype._getArraySize = function (array) {
        if (typeof array.vscode_indexedCnt === 'number') {
            return Promise.resolve([array.vscode_indexedCnt, array.vscode_namedCnt]);
        }
        if (this._node.v8Version) {
            var args = {
                expression: array.className === 'ArrayBuffer' ? "JSON.stringify([ array.byteLength, 1 ])" : "JSON.stringify([ array.length, Object.keys(array).length+1-array.length ])",
                disable_break: true,
                additional_context: [
                    { name: 'array', handle: array.handle }
                ]
            };
            this.log('va', "_getArraySize: array.length");
            return this._node.evaluate(args).then(function (response) {
                return JSON.parse(response.body.value);
            });
        }
        return Promise.resolve([]);
    };
    //--- ES6 Set/Map support
    NodeDebugSession.prototype._createSetMapVariable = function (name, obj) {
        var _this = this;
        var args = {
            // initially we need only the size
            expression: "JSON.stringify([ obj.size, Object.keys(obj).length ])",
            disable_break: true,
            additional_context: [
                { name: 'obj', handle: obj.handle }
            ]
        };
        this.log('va', "_createSetMapVariable: " + obj.type + ".size");
        return this._node.evaluate(args).then(function (response) {
            var pair = JSON.parse(response.body.value);
            var indexedSize = pair[0];
            var namedSize = pair[1];
            var typename = (obj.type === 'set') ? 'Set' : 'Map';
            return new vscode_debugadapter_1.Variable(name, typename + "[" + indexedSize + "]", _this._variableHandles.create(new SetMapContainer(obj)), indexedSize, namedSize);
        });
    };
    NodeDebugSession.prototype._createSetMapProperties = function (obj) {
        var _this = this;
        var args = {
            expression: "var r = {}; Object.keys(obj).forEach(k => { r[k] = obj[k] }); r",
            disable_break: true,
            additional_context: [
                { name: 'obj', handle: obj.handle }
            ]
        };
        return this._node.evaluate(args).then(function (response) {
            return _this._createProperties(response.body, 'named');
        });
    };
    NodeDebugSession.prototype._createSetElements = function (set, start, count) {
        var _this = this;
        var args = {
            expression: "var r = [], i = 0; set.forEach(v => { if (i >= " + start + " && i < " + (start + count) + ") r.push(v); i++; }); r",
            disable_break: true,
            additional_context: [
                { name: 'set', handle: set.handle }
            ]
        };
        this.log('va', "_createSetElements: set.slice " + start + " " + count);
        return this._node.evaluate(args).then(function (response) {
            var properties = response.body.properties || [];
            var selectedProperties = new Array();
            for (var _i = 0, properties_1 = properties; _i < properties_1.length; _i++) {
                var property = properties_1[_i];
                if (isIndex(property.name)) {
                    selectedProperties.push(property);
                }
            }
            return _this._createPropertyVariables(null, selectedProperties, true, start);
        });
    };
    NodeDebugSession.prototype._createMapElements = function (map, start, count) {
        var _this = this;
        // for each slot of the map we create three slots in a helper array: label, key, value
        var args = {
            expression: "var r=[],i=0; map.forEach((v,k) => { if (i >= " + start + " && i < " + (start + count) + ") { r.push(k+' \u2192 '+v); r.push(k); r.push(v);} i++; }); r",
            disable_break: true,
            additional_context: [
                { name: 'map', handle: map.handle }
            ]
        };
        this.log('va', "_createMapElements: map.slice " + start + " " + count);
        return this._node.evaluate(args).then(function (response) {
            var properties = response.body.properties || [];
            var selectedProperties = new Array();
            for (var _i = 0, properties_2 = properties; _i < properties_2.length; _i++) {
                var property = properties_2[_i];
                if (isIndex(property.name)) {
                    selectedProperties.push(property);
                }
            }
            return _this._resolveValues(selectedProperties).then(function () {
                var variables = new Array();
                var _loop_1 = function (i) {
                    var key = _this._getValueFromCache(selectedProperties[i + 1]);
                    var val = _this._getValueFromCache(selectedProperties[i + 2]);
                    var expander = new Expander(function (start, count) {
                        return Promise.all([
                            _this._createVariable('key', key),
                            _this._createVariable('value', val)
                        ]);
                    });
                    var x = _this._getValueFromCache(selectedProperties[i]);
                    variables.push(new vscode_debugadapter_1.Variable((start + (i / 3)).toString(), x.value, _this._variableHandles.create(expander)));
                };
                for (var i = 0; i < selectedProperties.length; i += 3) {
                    _loop_1(i);
                }
                return variables;
            });
        });
    };
    //--- long string support
    NodeDebugSession.prototype._createStringVariable = function (name, val, maxLength) {
        var _this = this;
        var str_val = val.value;
        if (typeof maxLength === 'number') {
            if (str_val.length > maxLength) {
                str_val = str_val.substr(0, maxLength) + '…';
            }
            return Promise.resolve(new vscode_debugadapter_1.Variable(name, this._escapeStringValue(str_val)));
        }
        if (this._node.v8Version && NodeDebugSession.LONG_STRING_MATCHER.exec(str_val)) {
            var args = {
                expression: "str",
                disable_break: true,
                additional_context: [
                    { name: 'str', handle: val.handle }
                ],
                maxStringLength: NodeDebugSession.MAX_STRING_LENGTH
            };
            this.log('va', "_createStringVariable: get full string");
            return this._node.evaluate(args).then(function (response) {
                str_val = response.body.value;
                return new vscode_debugadapter_1.Variable(name, _this._escapeStringValue(str_val));
            });
        }
        else {
            return Promise.resolve(new vscode_debugadapter_1.Variable(name, this._escapeStringValue(str_val)));
        }
    };
    NodeDebugSession.prototype._escapeStringValue = function (s) {
        /* disabled for now because chrome dev tools doesn't escape quotes either
        if (s) {
            s = s.replace(/\"/g, '\\"');	// escape quotes because they are used as delimiters for a string
        }
        */
        return "\"" + s + "\"";
    };
    //--- setVariable request -------------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.setVariableRequest = function (response, args) {
        var _this = this;
        var reference = args.variablesReference;
        var name = args.name;
        var value = args.value;
        var variablesContainer = this._variableHandles.get(reference);
        if (variablesContainer) {
            variablesContainer.SetValue(this, name, value).then(function (newVar) {
                var v = newVar;
                response.body = {
                    value: v.value
                };
                if (v.type) {
                    response.body.type = v.type;
                }
                if (v.variablesReference) {
                    response.body.variablesReference = v.variablesReference;
                }
                if (typeof v.indexedVariables === 'number') {
                    response.body.indexedVariables = v.indexedVariables;
                }
                if (typeof v.namedVariables === 'number') {
                    response.body.namedVariables = v.namedVariables;
                }
                _this.sendResponse(response);
            }).catch(function (err) {
                _this.sendErrorResponse(response, 2004, err.message);
            });
        }
        else {
            this.sendErrorResponse(response, 2025, Expander.SET_VALUE_ERROR);
        }
    };
    NodeDebugSession.prototype._setVariableValue = function (frame, scope, name, value) {
        // first we are evaluating the new value
        var _this = this;
        var evalArgs = {
            expression: value,
            disable_break: true,
            maxStringLength: NodeDebugSession.MAX_STRING_LENGTH,
            frame: frame
        };
        return this._node.evaluate(evalArgs).then(function (evalResponse) {
            var args = {
                scope: {
                    frameNumber: frame,
                    number: scope
                },
                name: name,
                newValue: evalResponse.body
            };
            return _this._node.setVariableValue(args).then(function (response) {
                return _this._createVariable('_setVariableValue', response.body.newValue);
            });
        });
    };
    NodeDebugSession.prototype._setPropertyValue = function (objHandle, propName, value) {
        var _this = this;
        if (this._node.v8Version) {
            // we are doing the evaluation of the new value and the assignment to an object property in a single evaluate.
            var args = {
                global: true,
                expression: "obj['" + propName + "'] = " + value,
                disable_break: true,
                additional_context: [
                    { name: 'obj', handle: objHandle }
                ],
                maxStringLength: NodeDebugSession.MAX_STRING_LENGTH
            };
            return this._node.evaluate(args).then(function (response) {
                return _this._createVariable('_setpropertyvalue', response.body);
            });
        }
        return Promise.reject(new Error(Expander.SET_VALUE_ERROR));
    };
    //--- pause request -------------------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.pauseRequest = function (response, args) {
        var _this = this;
        this._node.command('suspend', null, function (nodeResponse) {
            if (nodeResponse.success) {
                _this._stopped('pause');
                _this._lastStoppedEvent = new vscode_debugadapter_1.StoppedEvent(_this._reasonText('user_request'), NodeDebugSession.DUMMY_THREAD_ID);
                _this.sendResponse(response);
                _this.sendEvent(_this._lastStoppedEvent);
            }
            else {
                _this._sendNodeResponse(response, nodeResponse);
            }
        });
    };
    //--- continue request ----------------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.continueRequest = function (response, args) {
        var _this = this;
        this._disableSkipFiles = false;
        this._node.command('continue', null, function (nodeResponse) {
            _this._sendNodeResponse(response, nodeResponse);
        });
    };
    //--- step request --------------------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.nextRequest = function (response, args) {
        var _this = this;
        this._node.command('continue', { stepaction: 'next' }, function (nodeResponse) {
            _this._sendNodeResponse(response, nodeResponse);
        });
    };
    NodeDebugSession.prototype.stepInRequest = function (response, args) {
        var _this = this;
        this._node.command('continue', { stepaction: 'in' }, function (nodeResponse) {
            _this._sendNodeResponse(response, nodeResponse);
        });
    };
    NodeDebugSession.prototype.stepOutRequest = function (response, args) {
        var _this = this;
        this._disableSkipFiles = false;
        this._node.command('continue', { stepaction: 'out' }, function (nodeResponse) {
            _this._sendNodeResponse(response, nodeResponse);
        });
    };
    NodeDebugSession.prototype.stepBackRequest = function (response, args) {
        var _this = this;
        this._node.command('continue', { stepaction: 'back' }, function (nodeResponse) {
            _this._sendNodeResponse(response, nodeResponse);
        });
    };
    NodeDebugSession.prototype.reverseContinueRequest = function (response, args) {
        var _this = this;
        this._disableSkipFiles = false;
        this._node.command('continue', { stepaction: 'reverse' }, function (nodeResponse) {
            _this._sendNodeResponse(response, nodeResponse);
        });
    };
    NodeDebugSession.prototype.restartFrameRequest = function (response, args) {
        var _this = this;
        var restartFrameArgs = {
            frame: undefined
        };
        if (args.frameId > 0) {
            var frame = this._frameHandles.get(args.frameId);
            if (!frame) {
                this.sendErrorResponse(response, 2020, 'stack frame not valid', null, vscode_debugadapter_1.ErrorDestination.Telemetry);
                return;
            }
            restartFrameArgs.frame = frame.index;
        }
        this._node.command('restartFrame', restartFrameArgs, function (restartNodeResponse) {
            _this._restartFramePending = true;
            _this._node.command('continue', { stepaction: 'in' }, function (stepInNodeResponse) {
                _this._sendNodeResponse(response, stepInNodeResponse);
            });
        });
    };
    //--- evaluate request ----------------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.evaluateRequest = function (response, args) {
        var _this = this;
        var expression = args.expression;
        var evalArgs = {
            expression: expression,
            disable_break: true,
            maxStringLength: NodeDebugSession.MAX_STRING_LENGTH
        };
        if (typeof args.frameId === 'number' && args.frameId > 0) {
            var frame = this._frameHandles.get(args.frameId);
            if (!frame) {
                this.sendErrorResponse(response, 2020, 'stack frame not valid', null, vscode_debugadapter_1.ErrorDestination.Telemetry);
                return;
            }
            var frameIx = frame.index;
            evalArgs.frame = frameIx;
        }
        else {
            evalArgs.global = true;
        }
        this._node.command(this._nodeInjectionAvailable ? 'vscode_evaluate' : 'evaluate', evalArgs, function (resp) {
            if (resp.success) {
                _this._createVariable('evaluate', resp.body).then(function (v) {
                    if (v) {
                        response.body = {
                            result: v.value,
                            variablesReference: v.variablesReference,
                            namedVariables: v.namedVariables,
                            indexedVariables: v.indexedVariables
                        };
                    }
                    else {
                        response.success = false;
                        response.message = localize(39, null);
                    }
                    _this.sendResponse(response);
                });
            }
            else {
                response.success = false;
                if (resp.message.indexOf('ReferenceError: ') === 0 || resp.message === 'No frames') {
                    response.message = localize(40, null);
                }
                else if (resp.message.indexOf('SyntaxError: ') === 0) {
                    var m = resp.message.substring('SyntaxError: '.length).toLowerCase();
                    response.message = localize(41, null, m);
                }
                else {
                    response.message = resp.message;
                }
                _this.sendResponse(response);
            }
        });
    };
    //--- source request ------------------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.sourceRequest = function (response, args) {
        var _this = this;
        var sourceHandle = args.sourceReference;
        var srcSource = this._sourceHandles.get(sourceHandle);
        if (srcSource) {
            if (srcSource.source) {
                response.body = {
                    content: srcSource.source
                };
                this.sendResponse(response);
                return;
            }
            if (srcSource.scriptId) {
                this._loadScript(srcSource.scriptId).then(function (script) {
                    srcSource.source = script.contents;
                    response.body = {
                        content: srcSource.source,
                        mimeType: 'text/javascript'
                    };
                    _this.sendResponse(response);
                }).catch(function (err) {
                    _this.sendErrorResponse(response, 2026, localize(42, null));
                });
                return;
            }
        }
        this.sendErrorResponse(response, 2027, 'sourceRequest error: illegal handle', null, vscode_debugadapter_1.ErrorDestination.Telemetry);
    };
    NodeDebugSession.prototype._loadScript = function (scriptId) {
        var script = this._scripts.get(scriptId);
        if (!script) {
            this.log('ls', "_loadScript: " + scriptId);
            // not found
            var args = {
                types: 1 + 2 + 4,
                includeSource: true,
                ids: [scriptId]
            };
            script = this._node.scripts(args).then(function (nodeResponse) {
                return new Script(nodeResponse.body[0]);
            });
            this._scripts.set(scriptId, script);
        }
        return script;
    };
    //--- source request ------------------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.completionsRequest = function (response, args) {
        var _this = this;
        var line = args.text;
        var column = args.column;
        var prefix = line.substring(0, column);
        var expression;
        var dot = prefix.lastIndexOf('.');
        if (dot >= 0) {
            expression = prefix.substr(0, dot);
        }
        if (expression) {
            var evalArgs = {
                expression: "(function(x){var a=[];for(var o=x;o;o=o.__proto__){a.push(Object.getOwnPropertyNames(o))};return JSON.stringify(a)})(" + expression + ")",
                disable_break: true,
                maxStringLength: NodeDebugSession.MAX_JSON_LENGTH
            };
            if (typeof args.frameId === 'number' && args.frameId > 0) {
                var frame = this._frameHandles.get(args.frameId);
                if (!frame) {
                    this.sendErrorResponse(response, 2020, 'stack frame not valid', null, vscode_debugadapter_1.ErrorDestination.Telemetry);
                    return;
                }
                var frameIx = frame.index;
                evalArgs.frame = frameIx;
            }
            else {
                evalArgs.global = true;
            }
            this._node.evaluate(evalArgs).then(function (resp) {
                var set = new Set();
                var items = new Array();
                var arrays = JSON.parse(resp.body.value);
                for (var i = 0; i < arrays.length; i++) {
                    for (var _i = 0, _a = arrays[i]; _i < _a.length; _i++) {
                        var name_4 = _a[_i];
                        if (!isIndex(name_4) && !set.has(name_4)) {
                            set.add(name_4);
                            items.push({
                                label: name_4,
                                type: 'property'
                            });
                        }
                    }
                }
                response.body = {
                    targets: items
                };
                _this.sendResponse(response);
            }).catch(function (err) {
                response.body = {
                    targets: []
                };
                _this.sendResponse(response);
            });
        }
        else {
            var frame = void 0;
            if (typeof args.frameId === 'number' && args.frameId > 0) {
                frame = this._frameHandles.get(args.frameId);
            }
            if (!frame) {
                this.sendErrorResponse(response, 2020, 'stack frame not valid', null, vscode_debugadapter_1.ErrorDestination.Telemetry);
                return;
            }
            this.scopesRequest2(frame).then(function (targets) {
                response.body = {
                    targets: targets
                };
                _this.sendResponse(response);
            }).catch(function (err) {
                response.body = {
                    targets: []
                };
                _this.sendResponse(response);
            });
        }
    };
    NodeDebugSession.prototype.scopesRequest2 = function (frame) {
        var _this = this;
        var frameIx = frame.index;
        var scopesArgs = {
            frame_index: frameIx,
            frameNumber: frameIx
        };
        return this._node.command2('scopes', scopesArgs).then(function (scopesResponse) {
            var scopes = scopesResponse.body.scopes;
            return _this._resolveValues(scopes.map(function (scope) { return scope.object; })).then(function (resolved) {
                var set = new Set();
                var items = new Array();
                for (var _i = 0, resolved_1 = resolved; _i < resolved_1.length; _i++) {
                    var r = resolved_1[_i];
                    if (r.properties) {
                        for (var _a = 0, _b = r.properties; _a < _b.length; _a++) {
                            var property = _b[_a];
                            if (!isIndex(property.name) && !set.has(property.name)) {
                                set.add(property.name);
                                items.push({
                                    label: property.name,
                                    type: 'function'
                                });
                            }
                        }
                    }
                }
                return items;
            });
        }).catch(function (error) {
            // in case of error return empty array
            return [];
        });
    };
    //---- private helpers ----------------------------------------------------------------------------------------------------
    NodeDebugSession.prototype.log = function (traceCategory, message) {
        if (this._trace && (this._traceAll || this._trace.indexOf(traceCategory) >= 0)) {
            this.outLine(process.pid + ": " + message);
        }
    };
    /**
     * 'Path does not exist' error
     */
    NodeDebugSession.prototype.sendNotExistErrorResponse = function (response, attribute, path) {
        this.sendErrorResponse(response, 2007, localize(43, null, attribute, '{path}'), { path: path });
    };
    /**
     * 'Path not absolute' error with 'More Information' link.
     */
    NodeDebugSession.prototype.sendRelativePathErrorResponse = function (response, attribute, path) {
        var format = localize(44, null, attribute, '{path}', '${workspaceRoot}/');
        this.sendErrorResponseWithInfoLink(response, 2008, format, { path: path }, 20003);
    };
    /**
     * Send error response with 'More Information' link.
     */
    NodeDebugSession.prototype.sendErrorResponseWithInfoLink = function (response, code, format, variables, infoId) {
        this.sendErrorResponse(response, {
            id: code,
            format: format,
            variables: variables,
            showUser: true,
            url: 'http://go.microsoft.com/fwlink/?linkID=534832#_' + infoId.toString(),
            urlLabel: localize(45, null)
        });
    };
    /**
     * send a line of text to an output channel.
     */
    NodeDebugSession.prototype.outLine = function (message, category) {
        this.sendEvent(new vscode_debugadapter_1.OutputEvent(message + '\n', category ? category : 'console'));
    };
    /**
     * Tries to map a (local) VSCode path to a corresponding path on a remote host (where node is running).
     * The remote host might use a different OS so we have to make sure to create correct file paths.
     */
    NodeDebugSession.prototype._localToRemote = function (localPath) {
        if (this._remoteRoot && this._localRoot) {
            var relPath = PathUtils.makeRelative2(this._localRoot, localPath);
            var remotePath = PathUtils.join(this._remoteRoot, relPath);
            if (/^[a-zA-Z]:[\/\\]/.test(this._remoteRoot)) {
                remotePath = PathUtils.toWindows(remotePath);
            }
            this.log('bp', "_localToRemote: " + localPath + " -> " + remotePath);
            return remotePath;
        }
        else {
            return localPath;
        }
    };
    /**
     * Tries to map a path from the remote host (where node is running) to a corresponding local path.
     * The remote host might use a different OS so we have to make sure to create correct file paths.
     */
    NodeDebugSession.prototype._remoteToLocal = function (remotePath) {
        if (this._remoteRoot && this._localRoot) {
            var relPath = PathUtils.makeRelative2(this._remoteRoot, remotePath);
            var localPath = PathUtils.join(this._localRoot, relPath);
            if (process.platform === 'win32') {
                localPath = PathUtils.toWindows(localPath);
            }
            this.log('bp', "_remoteToLocal: " + remotePath + " -> " + localPath);
            return localPath;
        }
        else {
            return remotePath;
        }
    };
    NodeDebugSession.prototype._sendNodeResponse = function (response, nodeResponse) {
        if (nodeResponse.success) {
            this.sendResponse(response);
        }
        else {
            var errmsg = nodeResponse.message;
            if (errmsg.indexOf('unresponsive') >= 0) {
                this.sendErrorResponse(response, 2015, localize(46, null), { _request: nodeResponse.command });
            }
            else if (errmsg.indexOf('timeout') >= 0) {
                this.sendErrorResponse(response, 2016, localize(47, null), { _request: nodeResponse.command });
            }
            else {
                this.sendErrorResponse(response, 2013, 'Node.js request \'{_request}\' failed (reason: {_error}).', { _request: nodeResponse.command, _error: errmsg }, vscode_debugadapter_1.ErrorDestination.Telemetry);
            }
        }
    };
    NodeDebugSession.prototype._cache = function (handle, obj) {
        this._refCache.set(handle, obj);
    };
    NodeDebugSession.prototype._getValueFromCache = function (container) {
        var value = this._refCache.get(container.ref);
        if (value) {
            return value;
        }
        // console.error('ref not found cache');
        return null;
    };
    NodeDebugSession.prototype._resolveValues = function (mirrors) {
        var _this = this;
        var needLookup = new Array();
        for (var _i = 0, mirrors_1 = mirrors; _i < mirrors_1.length; _i++) {
            var mirror = mirrors_1[_i];
            if (!mirror.value && mirror.ref) {
                if (needLookup.indexOf(mirror.ref) < 0) {
                    needLookup.push(mirror.ref);
                }
            }
        }
        if (needLookup.length > 0) {
            return this._resolveToCache(needLookup).then(function () {
                return mirrors.map(function (m) { return _this._getCache(m); });
            });
        }
        else {
            //return Promise.resolve(<V8Object[]>mirrors);
            return Promise.resolve(mirrors.map(function (m) { return _this._getCache(m); }));
        }
    };
    NodeDebugSession.prototype._getCache = function (m) {
        if (typeof m.ref === 'number') {
            return this._refCache.get(m.ref);
        }
        if (typeof m.handle === 'number') {
            return this._refCache.get(m.handle);
        }
        return null;
    };
    NodeDebugSession.prototype._resolveToCache = function (handles) {
        var _this = this;
        var lookup = new Array();
        for (var _i = 0, handles_1 = handles; _i < handles_1.length; _i++) {
            var handle = handles_1[_i];
            var val = this._refCache.get(handle);
            if (!val) {
                if (handle >= 0) {
                    lookup.push(handle);
                }
                else {
                }
            }
        }
        if (lookup.length > 0) {
            var cmd = this._nodeInjectionAvailable ? 'vscode_lookup' : 'lookup';
            this.log('va', "_resolveToCache: " + cmd + " " + lookup.length + " handles");
            return this._node.command2(cmd, { handles: lookup }).then(function (resp) {
                for (var key in resp.body) {
                    var obj = resp.body[key];
                    var handle = obj.handle;
                    _this._cache(handle, obj);
                }
                return handles.map(function (handle) { return _this._refCache.get(handle); });
            }).catch(function (resp) {
                var val;
                if (resp.message.indexOf('timeout') >= 0) {
                    val = { type: 'number', value: '<...>' };
                }
                else {
                    val = { type: 'number', value: "<data error: " + resp.message + ">" };
                }
                // store error value in cache
                for (var i = 0; i < handles.length; i++) {
                    var handle = handles[i];
                    var r = _this._refCache.get(handle);
                    if (!r) {
                        _this._cache(handle, val);
                    }
                }
                return handles.map(function (handle) { return _this._refCache.get(handle); });
            });
        }
        else {
            return Promise.resolve(handles.map(function (handle) { return _this._refCache.get(handle); }));
        }
    };
    NodeDebugSession.prototype._rememberEntryLocation = function (path, line, column) {
        if (path) {
            this._entryPath = path;
            this._entryLine = line;
            this._entryColumn = this._adjustColumn(line, column);
            this._gotEntryEvent = true;
        }
    };
    /**
     * workaround for column being off in the first line (because of a wrapped anonymous function)
     */
    NodeDebugSession.prototype._adjustColumn = function (line, column) {
        if (line === 0) {
            column -= NodeDebugSession.FIRST_LINE_OFFSET;
            if (column < 0) {
                column = 0;
            }
        }
        return column;
    };
    /**
     * Returns script id for the given script name or -1 if not found.
     */
    NodeDebugSession.prototype._findModule = function (name) {
        var args = {
            types: 1 + 2 + 4,
            filter: name
        };
        return this._node.scripts(args).then(function (resp) {
            for (var _i = 0, _a = resp.body; _i < _a.length; _i++) {
                var result = _a[_i];
                if (result.name === name) {
                    return result.id;
                }
            }
            return -1; // not found
        }).catch(function (err) {
            return -1; // error
        });
    };
    //---- private static ---------------------------------------------------------------
    NodeDebugSession.isJavaScript = function (path) {
        var name = Path.basename(path).toLowerCase();
        if (endsWith(name, '.js')) {
            return true;
        }
        try {
            var buffer = new Buffer(30);
            var fd = FS.openSync(path, 'r');
            FS.readSync(fd, buffer, 0, buffer.length, 0);
            FS.closeSync(fd);
            var line = buffer.toString();
            if (NodeDebugSession.NODE_SHEBANG_MATCHER.test(line)) {
                return true;
            }
        }
        catch (e) {
        }
        return false;
    };
    NodeDebugSession.compareVariableNames = function (v1, v2) {
        var n1 = v1.name;
        var n2 = v2.name;
        if (n1 === NodeDebugSession.PROTO) {
            return 1;
        }
        if (n2 === NodeDebugSession.PROTO) {
            return -1;
        }
        // convert [n], [n..m] -> n
        n1 = NodeDebugSession.extractNumber(n1);
        n2 = NodeDebugSession.extractNumber(n2);
        var i1 = parseInt(n1);
        var i2 = parseInt(n2);
        var isNum1 = !isNaN(i1);
        var isNum2 = !isNaN(i2);
        if (isNum1 && !isNum2) {
            return 1; // numbers after names
        }
        if (!isNum1 && isNum2) {
            return -1; // names before numbers
        }
        if (isNum1 && isNum2) {
            return i1 - i2;
        }
        return n1.localeCompare(n2);
    };
    NodeDebugSession.extractNumber = function (s) {
        if (s[0] === '[' && s[s.length - 1] === ']') {
            return s.substring(1, s.length - 1);
        }
        return s;
    };
    NodeDebugSession.killTree = function (processId) {
        if (process.platform === 'win32') {
            var TASK_KILL = 'C:\\Windows\\System32\\taskkill.exe';
            // when killing a process in Windows its child processes are *not* killed but become root processes.
            // Therefore we use TASKKILL.EXE
            try {
                CP.execSync(TASK_KILL + " /F /T /PID " + processId);
            }
            catch (err) {
            }
        }
        else {
            // on linux and OS X we kill all direct and indirect child processes as well
            try {
                var cmd = Path.join(__dirname, './terminateProcess.sh');
                CP.spawnSync(cmd, [processId.toString()]);
            }
            catch (err) {
            }
        }
    };
    return NodeDebugSession;
}(vscode_debugadapter_1.DebugSession));
NodeDebugSession.MAX_STRING_LENGTH = 10000; // max string size to return in 'evaluate' request
NodeDebugSession.MAX_JSON_LENGTH = 500000; // max size of stringified object to return in 'evaluate' request
NodeDebugSession.NODE_TERMINATION_POLL_INTERVAL = 3000;
NodeDebugSession.ATTACH_TIMEOUT = 10000;
NodeDebugSession.RUNINTERMINAL_TIMEOUT = 5000;
NodeDebugSession.PREVIEW_PROPERTIES = 3; // maximum number of properties to show in object/array preview
NodeDebugSession.PREVIEW_MAX_STRING_LENGTH = 50; // truncate long strings for object/array preview
NodeDebugSession.NODE = 'node';
NodeDebugSession.DUMMY_THREAD_ID = 1;
NodeDebugSession.DUMMY_THREAD_NAME = 'Node';
NodeDebugSession.FIRST_LINE_OFFSET = 62;
NodeDebugSession.PROTO = '__proto__';
NodeDebugSession.DEBUG_INJECTION = 'debugInjection.js';
NodeDebugSession.NODE_SHEBANG_MATCHER = new RegExp('#! */usr/bin/env +node');
NodeDebugSession.LONG_STRING_MATCHER = /\.\.\. \(length: [0-9]+\)$/;
NodeDebugSession.HITCOUNT_MATCHER = /(>|>=|=|==|<|<=|%)?\s*([0-9]+)/;
//--- scopes request ------------------------------------------------------------------------------------------------------
NodeDebugSession.SCOPE_NAMES = [
    localize(48, null),
    localize(49, null),
    localize(50, null),
    localize(51, null),
    localize(52, null),
    localize(53, null),
    localize(54, null)
];
exports.NodeDebugSession = NodeDebugSession;
var INDEX_PATTERN = /^[0-9]+$/;
function isIndex(name) {
    switch (typeof name) {
        case 'number':
            return true;
        case 'string':
            return INDEX_PATTERN.test(name);
        default:
            return false;
    }
}
function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}
function random(low, high) {
    return Math.floor(Math.random() * (high - low) + low);
}
vscode_debugadapter_1.DebugSession.run(NodeDebugSession);

//# sourceMappingURL=../../out/node/nodeDebug.js.map
