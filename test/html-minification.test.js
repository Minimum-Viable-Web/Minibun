import test from 'node:test';
import assert from 'node:assert/strict';

import { HTMLMinifier } from '../src/html-minification.js';

test('HTMLMinifier removes comments and collapses whitespace', () => {
  const source = `
    <!-- page header -->
    <div>
      <p>  hello  </p>
    </div>
  `;
  const minifier = new HTMLMinifier();
  const output = minifier.minifyHTML(source);

  assert.ok(!output.includes('<!--'));
  assert.ok(!output.includes('page header'));
  assert.ok(output.includes('<div><p> hello </p></div>'));
});

test('HTMLMinifier removes spaces between tags', () => {
  const minifier = new HTMLMinifier();
  const output = minifier.minifyHTML('<div>  <span>  </span>  </div>');
  assert.equal(output, '<div><span></span></div>');
});

test('HTMLMinifier collapses boolean attributes', () => {
  const minifier = new HTMLMinifier();
  const output = minifier.minifyHTML('<input disabled="disabled" checked="checked">');
  assert.ok(output.includes('disabled'));
  assert.ok(!output.includes('disabled="disabled"'));
  assert.ok(!output.includes('checked="checked"'));
});

test('HTMLMinifier removes quotes from safe attribute values', () => {
  const minifier = new HTMLMinifier();
  const output = minifier.minifyHTML('<div class="card" id="main">');
  assert.ok(output.includes('class=card'));
  assert.ok(output.includes('id=main'));
});

test('HTMLMinifier preserves quotes on attribute values with spaces or special chars', () => {
  const minifier = new HTMLMinifier();
  const output = minifier.minifyHTML('<div class="card item" title="hello world">');
  assert.ok(output.includes('"card item"'));
  assert.ok(output.includes('"hello world"'));
});

test('HTMLMinifier removes trailing slash on void elements', () => {
  const minifier = new HTMLMinifier();
  const output = minifier.minifyHTML('<br /><hr /><img src="a.png" />');
  assert.ok(!output.includes('/>'));
  assert.ok(output.includes('<br>'));
  assert.ok(output.includes('<hr>'));
});

test('HTMLMinifier preserves <pre> content', () => {
  const source = '<pre>  line 1\n  line 2  </pre>';
  const minifier = new HTMLMinifier();
  const output = minifier.minifyHTML(source);
  assert.ok(output.includes('  line 1\n  line 2  '));
});

test('HTMLMinifier preserves <code> content', () => {
  const source = '<code>  const x = 1;  </code>';
  const minifier = new HTMLMinifier();
  const output = minifier.minifyHTML(source);
  assert.ok(output.includes('  const x = 1;  '));
});

test('HTMLMinifier preserves <textarea> content', () => {
  const source = '<textarea>  some text\n  here  </textarea>';
  const minifier = new HTMLMinifier();
  const output = minifier.minifyHTML(source);
  assert.ok(output.includes('  some text\n  here  '));
});

test('HTMLMinifier preserves <script> blocks', () => {
  const source = '<script>  const x = 1;  if (x > 0) {}  </script>';
  const minifier = new HTMLMinifier();
  const output = minifier.minifyHTML(source);
  assert.ok(output.includes('const x = 1;  if (x > 0) {}'));
});

test('HTMLMinifier preserves <style> blocks', () => {
  const source = '<style>  .card { color: red; }  </style>';
  const minifier = new HTMLMinifier();
  const output = minifier.minifyHTML(source);
  assert.ok(output.includes('.card { color: red; }'));
});

test('HTMLMinifier keeps conditional comments', () => {
  const source = '<!--[if IE]><link href="ie.css"><![endif]--><div>ok</div>';
  const minifier = new HTMLMinifier();
  const output = minifier.minifyHTML(source);
  assert.ok(output.includes('<!--[if IE]>'));
});

test('HTMLMinifier handles empty and whitespace-only input', () => {
  const minifier = new HTMLMinifier();
  assert.equal(minifier.minifyHTML(''), '');
  assert.equal(minifier.minifyHTML('   \n\t  '), '');
});

test('HTMLMinifier can keep comments when keepComments option is true', () => {
  const source = '<!-- keep me --><div>hello</div>';
  const minifier = new HTMLMinifier({ keepComments: true });
  const output = minifier.minifyHTML(source);
  assert.ok(output.includes('<!-- keep me -->'));
});
