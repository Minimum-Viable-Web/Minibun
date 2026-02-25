import test from 'node:test';
import assert from 'node:assert/strict';

import { CSSMinifier } from '../src/css-minification.js';

test('CSSMinifier removes comments and collapses whitespace', () => {
  const source = `
    /* Header comment */
    .card {
      color:   red;
      /* inline comment */
      padding:  10px;
    }
  `;
  const minifier = new CSSMinifier();
  const output = minifier.minifyCSS(source);

  assert.ok(!output.includes('Header comment'));
  assert.ok(!output.includes('inline comment'));
  assert.ok(!output.includes('/*'));
  assert.ok(!/\s{2,}/.test(output));
  assert.ok(output.includes('.card{color:red;padding:10px}'));
});

test('CSSMinifier removes trailing semicolons before }', () => {
  const minifier = new CSSMinifier();
  const output = minifier.minifyCSS('.a { color: red; }');
  assert.ok(output.includes('color:red}'));
  assert.ok(!output.includes('red;}'));
});

test('CSSMinifier preserves string literals', () => {
  const source = `.icon::before { content: "  hello  /*not a comment*/  "; }`;
  const minifier = new CSSMinifier();
  const output = minifier.minifyCSS(source);
  assert.ok(output.includes('"  hello  /*not a comment*/  "'));
});

test('CSSMinifier preserves url() quoted values', () => {
  const source = `.bg { background: url("path/to/image.png"); }`;
  const minifier = new CSSMinifier();
  const output = minifier.minifyCSS(source);
  assert.ok(output.includes('url("path/to/image.png")'));
});

test('CSSMinifier handles empty and whitespace-only input', () => {
  const minifier = new CSSMinifier();
  assert.equal(minifier.minifyCSS(''), '');
  assert.equal(minifier.minifyCSS('   \n\t  '), '');
});

test('CSSMinifier can keep comments when keepComments option is true', () => {
  const source = `/* keep me */ .a { color: red; }`;
  const minifier = new CSSMinifier({ keepComments: true });
  const output = minifier.minifyCSS(source);
  assert.ok(output.includes('/* keep me */'));
});

test('CSSMinifier handles @-rules correctly', () => {
  const source = `
    @media (max-width: 768px) {
      .card {
        padding: 5px;
      }
    }
  `;
  const minifier = new CSSMinifier();
  const output = minifier.minifyCSS(source);
  assert.ok(output.includes('@media'));
  assert.ok(output.includes('(max-width:768px)'));
  assert.ok(output.includes('padding:5px'));
});
