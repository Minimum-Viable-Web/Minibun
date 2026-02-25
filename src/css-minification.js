// src/css-minification.js
// Regex-based CSS minifier: removes comments, collapses whitespace, and strips
// unnecessary characters while preserving quoted string literals.

export class CSSMinifier {
  constructor(options = {}) {
    this.options = {
      keepComments: false,
      ...options,
    };
  }

  minifyCSS(code) {
    let css = String(code);
    if (css.trim() === '') return '';

    if (this.options.keepComments) {
      return css;
    }

    // 1) Preserve quoted strings (content: "...", url("..."), etc.)
    const strings = [];
    css = css.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, (match) => {
      strings.push(match);
      return `__CSS_STR_${strings.length - 1}__`;
    });

    // 2) Remove CSS comments /* ... */
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');

    // 3) Collapse whitespace to single spaces
    css = css.replace(/\s+/g, ' ');

    // 4) Remove spaces around { } : ; ,
    css = css.replace(/\s*([{}:;,])\s*/g, '$1');

    // 5) Remove trailing semicolons before }
    css = css.replace(/;}/g, '}');

    // 6) Restore preserved strings
    css = css.replace(/__CSS_STR_(\d+)__/g, (_, i) => strings[i]);

    return css.trim();
  }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports.CSSMinifier = CSSMinifier;
}
