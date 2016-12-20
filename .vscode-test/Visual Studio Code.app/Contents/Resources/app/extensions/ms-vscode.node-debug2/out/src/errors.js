/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
"use strict";
const utils_1 = require('./utils');
function runtimeNotFound(_runtime) {
    return {
        id: 2001,
        format: utils_1.localize('VSND2001', "Cannot find runtime '{0}' on PATH.", '{_runtime}'),
        variables: { _runtime }
    };
}
exports.runtimeNotFound = runtimeNotFound;
function cannotLaunchInTerminal(_error) {
    return {
        id: 2011,
        format: utils_1.localize('VSND2011', "Cannot launch debug target in terminal ({0}).", '{_error}'),
        variables: { _error }
    };
}
exports.cannotLaunchInTerminal = cannotLaunchInTerminal;
function cannotLaunchDebugTarget(_error) {
    return {
        id: 2017,
        format: utils_1.localize('VSND2017', "Cannot launch debug target ({0}).", '{_error}'),
        variables: { _error },
        showUser: true,
        sendTelemetry: true
    };
}
exports.cannotLaunchDebugTarget = cannotLaunchDebugTarget;
function unknownConsoleType(consoleType) {
    return {
        id: 2028,
        format: utils_1.localize('VSND2028', "Unknown console type '{0}'.", consoleType)
    };
}
exports.unknownConsoleType = unknownConsoleType;
function cannotLaunchBecauseSourceMaps(programPath) {
    return {
        id: 2002,
        format: utils_1.localize('VSND2002', "Cannot launch program '{0}'; configuring source maps might help.", '{path}'),
        variables: { path: programPath }
    };
}
exports.cannotLaunchBecauseSourceMaps = cannotLaunchBecauseSourceMaps;
function cannotLaunchBecauseOutFiles(programPath) {
    return {
        id: 2003,
        format: utils_1.localize('VSND2003', "Cannot launch program '{0}'; setting the '{1}' attribute might help.", '{path}', 'outDir or outFiles'),
        variables: { path: programPath }
    };
}
exports.cannotLaunchBecauseOutFiles = cannotLaunchBecauseOutFiles;

//# sourceMappingURL=errors.js.map
