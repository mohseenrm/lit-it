/* global suite, test */

const vscode = require('vscode');
const lit = require('../extension');
const expect = require('chai').expect;

const checkSignature = lit.checkSignature,
      extractParameters = lit.extractParameters,
      prettyParameters = lit.prettyParameters,
      extractFunctionName = lit.extractFunctionName;

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
        const signature4 = "const testES6 = ( x ) => { return x+1 };";
        const signature5 = "let x = (x) => x*3;";

        expect( checkSignature( signature ) ).to.be.equal( 'ES6' );
        expect( checkSignature( signature2 ) ).to.be.equal( 'ES6' );
        expect( checkSignature( signature3 ) ).to.be.equal( 'ES6' );
        expect( checkSignature( signature4 ) ).to.be.equal( 'ES6' );
        expect( checkSignature( signature5 ) ).to.be.equal( 'ES6' );
    });

    it("check parameters", () => {
        const signature = ' function fn1(){';
        const signature2 = ' function fn2(a, b, c)';
        const signature3 = ' () = {console.log();}';
        const signature4 = ' (x, y, z)=>{return x+y+z;}';

        expect( extractParameters( signature ) ).to.deep.equal( [] );
        expect( extractParameters( signature2 ) ).to.deep.equal( ['a', 'b', 'c'] );
        expect( extractParameters( signature3 ) ).to.deep.equal( [] );
        expect( extractParameters( signature4 ) ).to.deep.equal( ['x', 'y', 'z'] );     
    });

    it("pretty formatting", () => {
        const signature = [];
        const signature2 = ['param1', 'param', 'xz', 'x'];
        const signature3 = ['xyz'];
        const signature4 = ['first_parameter', 'a', 'param2'];

        expect( prettyParameters( signature ) ).to.deep.equal( [] );
        expect( prettyParameters( signature2 ) ).to.deep.equal( ['param1', 'param ', 'xz    ', 'x     '] );
        expect( prettyParameters( signature3 ) ).to.deep.equal( ['xyz'] );
        expect( prettyParameters( signature4 ) ).to.deep.equal( ['first_parameter', 'a              ', 'param2         '] );
    });

    it("extracting function name", () => {
        const signature = 'const customFn = () => {}';
        const signature2 = 'let customFn = () => {}';
        const signature3 = 'var customFn = function(x) => {';
        const signature4 = 'function customFn(x, y){';
        const signature5 = 'function customFn(){';
        const signature6 = 'let x = function(param){';

        expect( extractFunctionName( signature ) ).to.equal( 'customFn' );
        expect( extractFunctionName( signature2 ) ).to.equal( 'customFn' );
        expect( extractFunctionName( signature3 ) ).to.equal( 'customFn' );
        expect( extractFunctionName( signature4 ) ).to.equal( 'customFn' );
        expect( extractFunctionName( signature5 ) ).to.equal( 'customFn' );
        expect( extractFunctionName( signature6 ) ).to.equal( 'x' );
    });
});