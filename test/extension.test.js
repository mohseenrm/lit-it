/* global suite, test */

//
// Note: This example test is leveraging the Mocha test framework. Please refer
// to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
var assert = require('assert');

// You can import and use all API from the 'vscode' module as well as import
// your extension to test it
const vscode = require('vscode');
var myExtension = require('../extension');
const expect = require('chai').expect;

// Defines a Mocha test suite to group tests of similar kind together
// suite("Extension Tests", function() {     // Defines a Mocha unit test
// test("Something 1", function() {         assert.equal(-1, [1, 2,
// 3].indexOf(5));         assert.equal(-1, [1, 2, 3].indexOf(0));     }); });

describe("lit-it-core", () => {
    it("chai test", () => {
        const test = [1, 2, 3].indexOf(0);
        expect(test)
            .to
            .equal(-1);
    });

    it("vscode activation test", () => {
        const editor = vscode.window.activeTextEditor;
        if( !editor )
            console.log( "No active Window" );
        const currentText = vscode.window.activeTextEditor.document;

        expect(currentText).to.exist;
    });
    it("vscode activation test 2", () => {
        const editor = vscode.window.activeTextEditor;
        if( !editor )
            console.log( "No active Window" );
        const currentText = vscode.window.activeTextEditor.document;
        
        expect(editor.document.lineCount).to.equal(1);
        expect(editor.document.isUntitled).to.be.equal(true);
    });
});