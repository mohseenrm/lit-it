// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require ('vscode' );
const Range = vscode.Range;
const Position = vscode.Position;
const TextEdit = vscode.TextEdit;
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "lit-it" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    var disposable = vscode.commands.registerCommand('extension.sayHello', function () {
        // The code you place here will be executed every time your command is executed
        let sample = 'Hello MoMo!';
        // Display a message box to the user
        //vscode.window.showInformationMessage(sample);
        // doc reference
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api#Range
        // https://code.visualstudio.com/Docs/extensionAPI/vscode-api
        const editor = vscode.window.activeTextEditor;
        // const currentText =vscode.window.activeTextEditor.currentText;

        if( editor.selection.isEmpty ){
            const position = editor.selection.active;
            console.log( position );
            //test case if line is 1;
            const requiredRange = new Range( ( position.line + 1 ), 0, ( position.line + 2 ), 0 );
            // console.log( requiredRange );
            const textOfInterest = editor.document.getText( requiredRange );
            console.log( textOfInterest );
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