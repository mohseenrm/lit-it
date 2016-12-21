/**
 * Lit-it  : Add character to your JSDocs
 * Author  : Mohseen Mukaddam [mohseenmukaddam6@gmail.com]
 * License : Apache 2.0
 */
const vscode = require ('vscode' );
const Range = vscode.Range;
const Position = vscode.Position;
const TextEdit = vscode.TextEdit;
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "Lit-it" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    var disposable = vscode.commands.registerCommand('extension.sayHello', function () {
        
        // doc reference
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api#Range
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api
        const editor = vscode.window.activeTextEditor;
        // const currentText =vscode.window.activeTextEditor.currentText;

        if( editor.selection.isEmpty ){
            const position = editor.selection.active;
            console.log( position );
            //test case if line is 1;
            //get below line
            const requiredRange = new Range( ( position.line + 1 ), 0, ( position.line + 2 ), 0 );

            const textOfInterest = editor.document.getText( requiredRange );
            console.log( textOfInterest );
            //insert this at current position
            const insertionText = new TextEdit( new Range( ( position.line ), 0, ( position.line + 1 ), 0 ), "Custom String inserted\n" );

            var workSpaceEdit = new vscode.WorkspaceEdit();
            workSpaceEdit.set( editor.document.uri, [ insertionText ] );

            vscode.workspace.applyEdit( workSpaceEdit );
        }
        else
            vscode.window.showInformationMessage( 'Lit-it does not work with selection' );
        // vscode.window.showInformationMessage(currentText.getText());

    });

    context.subscriptions.push(disposable);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;
//class, constructor, prototype
const checkSignature = ( signature ) => {
    if( signature.includes( 'function' ) )
        return 'FUNCTION';
    return 'ES6';
}
/**
 * Reduces a sequence of names to initials.
 * @function makeInits
 * @memberOf Helper.
 * @param  {String} name  Space Delimited sequence of names.
 * @param  {String} sep   A period separating the initials.
 * @param  {String} trail A period ending the initials.
 * @param  {String} hyph  A hypen separating double names.
 * @return {String}       Properly formatted initials.
 */

const functionDocString = ( signature ) => {};
exports.functionDocString = functionDocString;

exports.checkSignature = checkSignature;