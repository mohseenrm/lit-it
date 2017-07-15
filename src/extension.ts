/**
 * Lit-it  : Add character to your JSDocs
 * Author  : Mohseen Mukaddam [mohseenmukaddam6@gmail.com]
 * License : Apache 2.0
 */
import * as vscode from 'vscode';
import {Range, Position, TextEdit} from 'vscode';
let count: number;

// https://code.visualstudio.com/Docs/extensionAPI/vscode-api#_workspace
// subscribe to onDidChangeTextDocument and add move selection

/**
 * @function activate
 * @param  {type} context {description}
 * @return {type} {description}
 */
function activate(context: vscode.ExtensionContext): void {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "Lit-it" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    const disposable: vscode.Disposable = vscode.commands.registerCommand('extension.litIt', () => {

        // doc reference
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api#Range
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api
        const editor: vscode.TextEditor = vscode.window.activeTextEditor;
        // const currentText =vscode.window.activeTextEditor.currentText;

        if ( editor.selection.isEmpty ) {
            const position: vscode.Position = editor.selection.active;
            console.log( position );
            // test case if line is 1;
            // get below line
            const requiredRange: Range = new Range( ( position.line + 1 ), 0, ( position.line + 2 ), 0 );

            const textOfInterest: string = editor.document.getText( requiredRange );
            console.log( textOfInterest );

            // generate docString
            const docString: string = functionDocString( textOfInterest );

            // insert this at current position
            const insertionText: TextEdit = new TextEdit( new Range( ( position.line ), 0, ( position.line + 1 ), 0 ), docString );

            const workSpaceEdit: vscode.WorkspaceEdit = new vscode.WorkspaceEdit();
            workSpaceEdit.set( editor.document.uri, [ insertionText ] );

            // console.log(functionDocString(''));
            // apply edit
            vscode.workspace.applyEdit( workSpaceEdit );
        } else { vscode.window.showInformationMessage( 'Lit-it does not work with selection' ); }
        // vscode.window.showInformationMessage(currentText.getText());
        count = 0;
        const dispose: vscode.Disposable = vscode.workspace.onDidChangeTextDocument(tabEventListner);
        // probably use promises to dispose the event listener

    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
function deactivate(): boolean {
    return true;
}

// file signature
function checkSignature( signature: string ): string {
    if ( signature.includes( 'function' ) ) {
        return 'FUNCTION';
    }
    return 'ES6';
}
/**
 * @author Mohseen Mukaddam <mohseenmukaddam6@gmail.com>
 */

function functionDocString( signature: string ): string {
    const indentNum: number = signature.search(/\S/);
    let indent: string = ``;
    for (let i: number = 0; i < indentNum; i++) {
        indent += ' ';
    }
    let template: string = ``;
    template += `${indent}/**\n`;
    template += `${indent} * @function `;

    const name: string = extractFunctionName( signature );
    template += `${(name === '') ? `{function name}\n` : `${name}\n`}`;

    const parameters: string[] = extractParameters( signature );

    if ( parameters.length === 0 ) {
        template += `${indent} * @return {type} {description}\n${indent} */\n`;
        return template;
    } else {
        const prettyParams: string[] = prettyParameters( parameters );
        let parameterStrings: string[] = prettyParams.map( (param: string) => `${indent} * @param  {type} ${param} {description}\n` );
        let parameterString: string = parameterStrings.reduce( ( acc: string, curr: string ) => acc.concat( curr ) ).toString();
        parameterString += `${indent} * @return {type} {description}\n${indent} */\n`;
        return( template.concat( parameterString ) );
    }
}

/**
 * @function extractParameters
 * @param  {String} signature The function signature
 * @return {List} List of parameters
 */
function extractParameters( signature: string ): string[] {
    const possibleParameters: string = signature.slice( signature.indexOf( '(' ) + 1, signature.indexOf( ')' ) ).trim();
    return (possibleParameters === '') ? [] : possibleParameters.split( ',' ).map( (str: string) => str.trim() );
}

function addPadding( str: string, max: number ): string  {
    if ( str.length < max ) {
        let i: number = str.length;
        for ( ; i < max; i++ ) {
            str += ' ';
        }
        return str;
    }
    return str;
}

function prettyParameters( listOfParameters: string[] ): string[] {
    const lengths: number[] = listOfParameters.map( (str: string) => str.length );
    const max: any = Math.max.apply( null, lengths );

    const mappingFunction: (x: string) => string = ( x: string ) => addPadding( x, max );
    return listOfParameters.map( mappingFunction );
}

function extractFunctionName( signature: string ): string {
    // check if contains function -> else check var. let, const
    // if yes check name in front -> else check var, let, const
    if ( signature.includes( 'function' ) ) {
        const currentPosition: number = signature.indexOf( 'function' ) + 8;
        const endSlicePosition: number = signature.indexOf( '(' );
        const name: string = signature.slice( currentPosition, endSlicePosition ).trim();
        return ( name !== '' ) ? name : extractAlternateFunctionName( signature );
    }
    return extractAlternateFunctionName( signature );
}

function extractAlternateFunctionName( signature: string ): string {
    if ( signature.includes( 'var' ) || signature.includes( 'let' ) || signature.includes( 'const' ) ) {
        if ( signature.includes( '=' ) ) {
            interface IMapIndex {
                var: number;
                const: number;
                let: number;
                [key: string]: number;
            }
            const mapIndex: IMapIndex = {
                var : signature.indexOf( 'var' ),
                const : signature.indexOf( 'const' ),
                let : signature.indexOf( 'let' ),
            };
            const keys: string[] = Object.keys( mapIndex ).filter( (x: string) => mapIndex[x] !== -1 );
            const startingIndex: number = mapIndex[ keys[0] ] + keys[0].length;

            return signature.slice( startingIndex, signature.indexOf( '=' ) ).trim();
        }

    }
    return '';
}

export {
    activate,
    deactivate,
    extractParameters,
    prettyParameters,
    functionDocString,
    checkSignature,
    extractFunctionName,
    extractAlternateFunctionName
};

function tabEventListner(): void {
    count++;
}
