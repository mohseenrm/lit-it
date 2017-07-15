/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
function textToMarkedString(text) {
    return text.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&'); // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
}
exports.textToMarkedString = textToMarkedString;
//# sourceMappingURL=https://ticino.blob.core.windows.net/sourcemaps/2648980a697a4c8fb5777dcfb2ab110cec8a2f58/extensions/php/out/features/utils/markedTextUtil.js.map
