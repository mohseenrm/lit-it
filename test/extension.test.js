/* global suite, test */

var assert = require('assert');

// You can import and use all API from the 'vscode' module as well as import
// your extension to test it
const vscode = require('vscode');
const lit = require('../extension');
const expect = require('chai').expect;

const checkSignature = lit.checkSignature;

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

describe("Doc String generation", () => {
    
    it("standard function signature check", () => {
        const functionSignature = " function testFn(x, y){";
        const functionSignature2 = "export default function testFn(x, y)";
        const functionSignature3 = "const beta = function testFn()";
        const functionSignature4 = "var x = function testFn(y){";

        expect( checkSignature( functionSignature ) ).to.be.equal( 'FUNCTION' );
        expect( checkSignature( functionSignature2 ) ).to.be.equal( 'FUNCTION' );
        expect( checkSignature( functionSignature3 ) ).to.be.equal( 'FUNCTION' );
        expect( checkSignature( functionSignature4 ) ).to.be.equal( 'FUNCTION' );
    });

    it("ES6 function signature check", () => {
        const signature = "() => {";
        const signature2 = "( velocity ) => {";
        const signature3 = "( velocity, distance ) => {";
        const signature4 = "( x ) => { return x+1 };";
        const signature5 = "let x = (x) => x*3;";
    });
});