"use strict";
/**
 * Lit-it  : Add character to your JSDocs
 * Author  : Mohseen Mukaddam [mohseenmukaddam6@gmail.com]
 * License : Apache 2.0
 */
const vscode = require("vscode");
const Range = vscode.Range;
const Position = vscode.Position;
const TextEdit = vscode.TextEdit;
// https://code.visualstudio.com/Docs/extensionAPI/vscode-api#_workspace
// subscribe to onDidChangeTextDocument and add move selection
let count = 0;
/**
 * @function activate
 * @param  {type} context {description}
 * @return {type} {description}
 */
function activate(context) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "Lit-it" is now active!');
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    const disposable = vscode.commands.registerCommand('extension.litIt', () => {
        // doc reference
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api#Range
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api
        const editor = vscode.window.activeTextEditor;
        // const currentText =vscode.window.activeTextEditor.currentText;
        if (editor.selection.isEmpty) {
            const position = editor.selection.active;
            console.log(position);
            // test case if line is 1;
            // get below line
            const requiredRange = new Range((position.line + 1), 0, (position.line + 2), 0);
            const textOfInterest = editor.document.getText(requiredRange);
            console.log(textOfInterest);
            // generate docString
            const docString = functionDocString(textOfInterest);
            // insert this at current position
            const insertionText = new TextEdit(new Range((position.line), 0, (position.line + 1), 0), docString);
            const workSpaceEdit = new vscode.WorkspaceEdit();
            workSpaceEdit.set(editor.document.uri, [insertionText]);
            // console.log(functionDocString(''));
            // apply edit
            vscode.workspace.applyEdit(workSpaceEdit);
        }
        else {
            vscode.window.showInformationMessage('Lit-it does not work with selection');
        }
        // vscode.window.showInformationMessage(currentText.getText());
        // let count = 0;
        const dispose = vscode.workspace.onDidChangeTextDocument(tabEventListner);
        // probably use promises to dispose the event listener
    });
    context.subscriptions.push(disposable);
}
// this method is called when your extension is deactivated
const deactivate = () => { return; };
// file signature
const checkSignature = (signature) => {
    if (signature.includes('function')) {
        return 'FUNCTION';
    }
    return 'ES6';
};
/**
 * @author Mohseen Mukaddam <mohseenmukaddam6@gmail.com>
 */
const functionDocString = (signature) => {
    const indentNum = signature.search(/\S/);
    let indent = ``;
    for (let i = 0; i < indentNum; i++) {
        indent += ' ';
    }
    let template = ``;
    template += `${indent}/**\n`;
    template += `${indent} * @function `;
    const name = extractFunctionName(signature);
    template += `${(name === '') ? `{function name}\n` : `${name}\n`}`;
    const parameters = extractParameters(signature);
    if (parameters.length === 0) {
        template += `${indent} * @return {type} {description}\n${indent} */\n`;
        return template;
    }
    else {
        const prettyParams = prettyParameters(parameters);
        let parameterString = prettyParams.map((param) => `${indent} * @param  {type} ${param} {description}\n`);
        parameterString = parameterString.reduce((acc, curr) => acc.concat(curr));
        parameterString += `${indent} * @return {type} {description}\n${indent} */\n`;
        return (template.concat(parameterString));
    }
};
/**
 * @function extractParameters
 * @param  {String} signature The function signature
 * @return {List} List of parameters
 */
const extractParameters = (signature) => {
    const possibleParameters = signature.slice(signature.indexOf('(') + 1, signature.indexOf(')')).trim();
    return (possibleParameters === '') ? [] : possibleParameters.split(',').map((str) => str.trim());
};
const addPadding = (indent, max) => {
    if (indent.length < max) {
        let i = indent.length;
        for (; i < max; i++) {
            indent += ' ';
        }
    }
    return indent;
};
const prettyParameters = (listOfParameters) => {
    const lengths = listOfParameters.map((str) => str.length);
    const max = Math.max.apply(null, lengths);
    const mappingFunction = (x) => addPadding(x, max);
    return listOfParameters.map(mappingFunction);
};
const extractFunctionName = (signature) => {
    // check if contains function -> else check var. let, const
    // if yes check name in front -> else check var, let, const
    if (signature.includes('function')) {
        const currentPosition = signature.indexOf('function') + 8;
        const endSlicePosition = signature.indexOf('(');
        const name = signature.slice(currentPosition, endSlicePosition).trim();
        return (name !== '') ? name : extractAlternateFunctionName(signature);
    }
    return extractAlternateFunctionName(signature);
};
const extractAlternateFunctionName = (signature) => {
    if (signature.includes('var') || signature.includes('let') || signature.includes('const')) {
        if (signature.includes('=')) {
            const mapIndex = {
                var: signature.indexOf('var'),
                const: signature.indexOf('const'),
                let: signature.indexOf('let')
            };
            const keys = Object.keys(mapIndex).filter((x) => mapIndex[x] !== -1);
            const startingIndex = mapIndex[keys[0]] + keys[0].length;
            return signature.slice(startingIndex, signature.indexOf('=')).trim();
        }
    }
    return '';
};
const tabEventListner = (event) => {
    count++;
};
module.exports = {
    activate,
    checkSignature,
    deactivate,
    extractFunctionName,
    extractParameters,
    functionDocString,
    prettyParameters
};
//# sourceMappingURL=extension.js.map