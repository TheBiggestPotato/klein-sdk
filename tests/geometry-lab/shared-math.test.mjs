import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateMathNumber,
  formatMathNode,
  parseMath,
} from '../../dist/math/index.js';

function evaluate(input) {
  return evaluateMathNumber(parseMath(input).ast);
}

test('shared math applies exponentiation before unary signs', () => {
  assert.equal(evaluate('-2^2'), -4);
  assert.equal(evaluate('(-2)^2'), 4);
  assert.equal(evaluate('2^-2'), 0.25);
  assert.equal(evaluate('2^3^2'), 512);
});

test('shared math distinguishes common and natural logarithms', () => {
  assert.equal(evaluate('log(1000)'), 3);
  assert.equal(evaluate('ln(e)'), 1);
});

test('plain formatting preserves unary, power, and right-operand grouping', () => {
  for (const input of ['(-2)^2', '(2^3)^2', '1-(2-3)', '8/(4/2)']) {
    const parsed = parseMath(input).ast;
    const formatted = formatMathNode(parsed);
    assert.equal(evaluate(formatted), evaluateMathNumber(parsed), `${input} formatted as ${formatted}`);
  }
});

test('LaTeX formatting preserves a nested power base', () => {
  assert.equal(formatMathNode(parseMath('(2^3)^2').ast, 'latex'), '(2^{3})^{2}');
});
