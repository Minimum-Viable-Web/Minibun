// src/html-minification.js
// Regex-based HTML minifier: removes comments, collapses whitespace, shortens
// boolean attributes, and strips unnecessary quotes while preserving content
// inside <pre>, <code>, <textarea>, <script>, and <style> blocks.

const BOOLEAN_ATTRS = new Set([
  'allowfullscreen','async','autofocus','autoplay','checked','controls',
  'default','defer','disabled','formnovalidate','hidden','inert','ismap',
  'itemscope','loop','multiple','muted','nomodule','novalidate','open',
  'playsinline','readonly','required','reversed','selected',
]);

export class HTMLMinifier {
  constructor(options = {}) {
    this.options = {
      keepComments: false,
      collapseBooleanAttributes: true,
      collapseAttributeQuotes: true,
      ...options,
    };
  }

  minifyHTML(code) {
    let html = String(code);
    if (html.trim() === '') return '';

    if (this.options.keepComments) {
      return html;
    }

    // 1) Preserve whitespace-sensitive and raw-content blocks via placeholders
    const preserved = [];
    const preserve = (match) => {
      preserved.push(match);
      return `__HTML_PRE_${preserved.length - 1}__`;
    };

    html = html.replace(/<(pre|code|textarea)(\s[^>]*)?>[\s\S]*?<\/\1>/gi, preserve);
    html = html.replace(/<script(\s[^>]*)?>[\s\S]*?<\/script>/gi, preserve);
    html = html.replace(/<style(\s[^>]*)?>[\s\S]*?<\/style>/gi, preserve);

    // 2) Remove HTML comments (but keep conditional comments <!--[if)
    html = html.replace(/<!--(?!\[if\s)[\s\S]*?-->/g, '');

    // 3) Collapse whitespace runs to single spaces
    html = html.replace(/\s+/g, ' ');

    // 4) Remove spaces between tags: > < → ><
    html = html.replace(/>\s+</g, '><');

    // 5) Remove trailing slash on void elements: <br /> → <br>
    html = html.replace(/<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b([^>]*?)\s*\/>/gi,
      '<$1$2>');

    // 6) Collapse boolean attributes: disabled="disabled" → disabled
    if (this.options.collapseBooleanAttributes) {
      html = html.replace(/(<[a-z][a-z0-9]*\s)([^>]*?)(\w+)="(\3)"([^>]*?>)/gi,
        (match, open, before, attr, val, after) => {
          if (BOOLEAN_ATTRS.has(attr.toLowerCase())) {
            return `${open}${before}${attr}${after}`;
          }
          return match;
        });
    }

    // 7) Remove quotes from safe single-token attribute values: class="card" → class=card
    if (this.options.collapseAttributeQuotes) {
      html = html.replace(/=["']([a-zA-Z0-9_\-.:]+)["']/g, '=$1');
    }

    // 8) Restore preserved blocks
    html = html.replace(/__HTML_PRE_(\d+)__/g, (_, i) => preserved[i]);

    return html.trim();
  }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports.HTMLMinifier = HTMLMinifier;
}
