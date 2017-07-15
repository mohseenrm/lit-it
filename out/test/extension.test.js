"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const extension_1 = require("../src/extension");
suite('Doc String generation', () => {
    test('standard function signature check', () => {
        const functionSignature = ' function testFn(x, y){';
        const functionSignature2 = 'export default function testFn(x, y)';
        const functionSignature3 = 'const beta = function testFn()';
        const functionSignature4 = 'var x = function testFn(y){';
        chai_1.expect(extension_1.checkSignature(functionSignature)).to.be.equal('FUNCTION');
        chai_1.expect(extension_1.checkSignature(functionSignature2)).to.be.equal('FUNCTION');
        chai_1.expect(extension_1.checkSignature(functionSignature3)).to.be.equal('FUNCTION');
        chai_1.expect(extension_1.checkSignature(functionSignature4)).to.be.equal('FUNCTION');
    });
    test('ES6 function signature check', () => {
        const signature = '() => {';
        const signature2 = '( velocity ) => {';
        const signature3 = '( velocity, distance ) => {';
        const signature4 = 'const testES6 = ( x ) => { return x+1 };';
        const signature5 = 'let x = (x) => x*3;';
        chai_1.expect(extension_1.checkSignature(signature)).to.be.equal('ES6');
        chai_1.expect(extension_1.checkSignature(signature2)).to.be.equal('ES6');
        chai_1.expect(extension_1.checkSignature(signature3)).to.be.equal('ES6');
        chai_1.expect(extension_1.checkSignature(signature4)).to.be.equal('ES6');
        chai_1.expect(extension_1.checkSignature(signature5)).to.be.equal('ES6');
    });
    test('check parameters', () => {
        const signature = ' function fn1(){';
        const signature2 = ' function fn2(a, b, c)';
        const signature3 = ' () = {console.log();}';
        const signature4 = ' (x, y, z)=>{return x+y+z;}';
        chai_1.expect(extension_1.extractParameters(signature)).to.deep.equal([]);
        chai_1.expect(extension_1.extractParameters(signature2)).to.deep.equal(['a', 'b', 'c']);
        chai_1.expect(extension_1.extractParameters(signature3)).to.deep.equal([]);
        chai_1.expect(extension_1.extractParameters(signature4)).to.deep.equal(['x', 'y', 'z']);
    });
    test('pretty formatting', () => {
        const signature = [];
        const signature2 = ['param1', 'param', 'xz', 'x'];
        const signature3 = ['xyz'];
        const signature4 = ['first_parameter', 'a', 'param2'];
        chai_1.expect(extension_1.prettyParameters(signature)).to.deep.equal([]);
        chai_1.expect(extension_1.prettyParameters(signature2)).to.deep.equal(['param1', 'param ', 'xz    ', 'x     ']);
        chai_1.expect(extension_1.prettyParameters(signature3)).to.deep.equal(['xyz']);
        chai_1.expect(extension_1.prettyParameters(signature4)).to.deep.equal(['first_parameter', 'a              ', 'param2         ']);
    });
    test('extracting function name', () => {
        const signature = 'const customFn = () => {}';
        const signature2 = 'let customFn = () => {}';
        const signature3 = 'var customFn = function(x) => {';
        const signature4 = 'function customFn(x, y){';
        const signature5 = 'function customFn(){';
        const signature6 = 'let x = function(param){';
        chai_1.expect(extension_1.extractFunctionName(signature)).to.equal('customFn');
        chai_1.expect(extension_1.extractFunctionName(signature2)).to.equal('customFn');
        chai_1.expect(extension_1.extractFunctionName(signature3)).to.equal('customFn');
        chai_1.expect(extension_1.extractFunctionName(signature4)).to.equal('customFn');
        chai_1.expect(extension_1.extractFunctionName(signature5)).to.equal('customFn');
        chai_1.expect(extension_1.extractFunctionName(signature6)).to.equal('x');
    });
    test('correctly indents nested blocks', () => {
        const oneSpaceSignature = ' fn(){';
        const oneSpaceExpected = ' /**\n' +
            '  * @function {function name}\n' +
            '  * @return {type} {description}\n' +
            '  */\n';
        const threeSpaceIndentSignature = '   fn(){';
        const threeSpaceIndentExpected = '   /**\n' +
            '    * @function {function name}\n' +
            '    * @return {type} {description}\n' +
            '    */\n';
        const fourSpaceIndentSignature = '    fn(){';
        const fourSpaceIndentExpected = '    /**\n' +
            '     * @function {function name}\n' +
            '     * @return {type} {description}\n' +
            '     */\n';
        chai_1.expect(extension_1.functionDocString(oneSpaceSignature)).to.equal(oneSpaceExpected);
        chai_1.expect(extension_1.functionDocString(threeSpaceIndentSignature)).to.equal(threeSpaceIndentExpected);
        chai_1.expect(extension_1.functionDocString(fourSpaceIndentSignature)).to.equal(fourSpaceIndentExpected);
    });
});
//# sourceMappingURL=extension.test.js.map