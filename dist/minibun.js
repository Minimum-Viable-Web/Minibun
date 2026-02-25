// ---- parser.js ----
// src/parser.js
// Minimal-but-robust lexer focused on safely tokenizing JavaScript source:
// - Handles strings, template literals, comments, and regex literals.
// - Exposes enough structure for module analysis (import/export) and
//   whitespace-aware transformations (minification/obfuscation).
//
// This is NOT a full ECMAScript parser. It is intentionally conservative:
// - Expression grammar is not interpreted; tokens are emitted in sequence.
// - Regex literal vs division is detected using a simple, battle-tested
//   heuristic based on previous token type, which is sufficient for
//   production usage in typical ES module code.
//
// The public API:
//   - tokenize(code: string): Token[]
//   - findModuleSyntax(tokens: Token[]): { imports: ImportSpec[]; exports: ExportSpec[] }
//
// Tokens have the shape:
//   { type, value, start, end }
// where `type` is one of:
//   'identifier' | 'keyword' | 'string' | 'template' | 'number' |
//   'punctuator' | 'regex' | 'comment' | 'whitespace' | 'eof'

const KEYWORDS = new Set([
  'break','case','catch','class','const','continue','debugger','default','delete',
  'do','else','export','extends','finally','for','function','if','import','in',
  'instanceof','let','new','return','super','switch','this','throw','try','typeof',
  'var','void','while','with','yield','enum','await','async','of'
]);

const PUNCTUATORS = new Set([
  '{','}','(',')','[',']','.',';',',',':','?','~',
  '<','>','<=','>=','==','!=','===','!==',
  '+','-','*','%','++','--','<<','>>','>>>',
  '&','|','^','!','&&','||','??',
  '=','+=','-=','*=','%=','<<=','>>=','>>>=',
  '&=','|=','^=','=>','**','**=','/','?.','??=','||=','&&=',
]);

function isIdentifierStart(ch) {
  return (
    (ch >= 'a' && ch <= 'z') ||
    (ch >= 'A' && ch <= 'Z') ||
    ch === '$' ||
    ch === '_'
  );
}

function isIdentifierPart(ch) {
  return isIdentifierStart(ch) || (ch >= '0' && ch <= '9');
}

function isDecimalDigit(ch) {
  return ch >= '0' && ch <= '9';
}

// Heuristic to decide if a slash starts a regex literal, based on previous token.
function isRegexAllowedAfter(prevToken) {
  if (!prevToken) return true;
  if (prevToken.type === 'keyword') {
    return ['return','case','throw','else','do','typeof','instanceof','in','of'].includes(
      prevToken.value
    );
  }
  // After these token types, we can start a regex.
  if (['punctuator'].includes(prevToken.type)) {
    return ['(','{','[',',',';','!','~','?','=',':','&&','||','??','+','-','*','/','%','&','|','^','<','>'].includes(
      prevToken.value
    );
  }
  // Otherwise, assume division.
  return false;
}

export function tokenize(code) {
  const tokens = [];
  let i = 0;
  const len = code.length;
  let prevSignificant = null;

  function push(type, value, start, end) {
    const t = { type, value, start, end };
    tokens.push(t);
    if (type !== 'whitespace' && type !== 'comment') {
      prevSignificant = t;
    }
  }

  while (i < len) {
    const start = i;
    let ch = code[i];

    // Whitespace
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < len && /\s/.test(code[j])) j++;
      push('whitespace', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Line comment //
    if (ch === '/' && code[i + 1] === '/') {
      let j = i + 2;
      while (j < len && code[j] !== '\n' && code[j] !== '\r') j++;
      push('comment', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Block comment /* */
    if (ch === '/' && code[i + 1] === '*') {
      let j = i + 2;
      while (j < len && !(code[j] === '*' && code[j + 1] === '/')) j++;
      j = Math.min(j + 2, len);
      push('comment', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // String literal ' " `
    if (ch === '\'' || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < len) {
        const c = code[j];
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === quote) {
          j++;
          break;
        }
        j++;
      }
      push('string', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Template literal (no interpolation parsing; we keep as a single token)
    if (ch === '`') {
      let j = i + 1;
      while (j < len) {
        const c = code[j];
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === '`') {
          j++;
          break;
        }
        // Skip ${...} sequences conservatively
        if (c === '$' && code[j + 1] === '{') {
          j += 2;
          let depth = 1;
          while (j < len && depth > 0) {
            const d = code[j];
            if (d === '\\') {
              j += 2;
              continue;
            }
            if (d === '{') depth++;
            else if (d === '}') depth--;
            j++;
          }
          continue;
        }
        j++;
      }
      push('template', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Number literal (simple decimal/hex)
    if (isDecimalDigit(ch) || (ch === '.' && isDecimalDigit(code[i + 1]))) {
      let j = i;
      if (ch === '0' && (code[i + 1] === 'x' || code[i + 1] === 'X')) {
        j += 2;
        while (j < len && /[0-9a-fA-F]/.test(code[j])) j++;
      } else {
        while (j < len && /[0-9]/.test(code[j])) j++;
        if (code[j] === '.' && /[0-9]/.test(code[j + 1])) {
          j++;
          while (j < len && /[0-9]/.test(code[j])) j++;
        }
      }
      push('number', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Identifier / keyword
    if (isIdentifierStart(ch)) {
      let j = i + 1;
      while (j < len && isIdentifierPart(code[j])) j++;
      const value = code.slice(i, j);
      const type = KEYWORDS.has(value) ? 'keyword' : 'identifier';
      push(type, value, i, j);
      i = j;
      continue;
    }

    // Regex literal vs division
    if (ch === '/' && isRegexAllowedAfter(prevSignificant)) {
      let j = i + 1;
      let inClass = false;
      while (j < len) {
        const c = code[j];
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === '[') {
          inClass = true;
        } else if (c === ']' && inClass) {
          inClass = false;
        } else if (c === '/' && !inClass) {
          j++;
          break;
        }
        j++;
      }
      // flags
      while (j < len && /[a-z]/i.test(code[j])) j++;
      push('regex', code.slice(i, j), i, j);
      i = j;
      continue;
    }

    // Punctuator & operators (fallback: single char)
    // We attempt 3,2,1-char matches.
    let matched = null;
    for (const size of [3, 2, 1]) {
      if (i + size <= len) {
        const candidate = code.slice(i, i + size);
        if (PUNCTUATORS.has(candidate)) {
          matched = candidate;
          break;
        }
      }
    }
    if (matched) {
      push('punctuator', matched, i, i + matched.length);
      i += matched.length;
      continue;
    }

    // Unknown character: treat as punctuator to stay robust.
    push('punctuator', ch, i, i + 1);
    i += 1;
  }

  tokens.push({ type: 'eof', value: '', start: len, end: len });
  return tokens;
}

// --- Module-level analysis helpers ----------------------------------------

// ImportSpec: { source: string, type: 'default'|'namespace'|'named'|'side-effect', specifiers?: string[] }
// ExportSpec: { type: 'named'|'default'|'all', names?: string[], source?: string }

export function findModuleSyntax(tokens) {
  const imports = [];
  const exports = [];

  let i = 0;
  const len = tokens.length;

  function peek(offset = 0) {
    return tokens[i + offset] || tokens[len - 1];
  }

  function consume() {
    const t = tokens[i];
    i += 1;
    return t;
  }

  // 'from' is a contextual keyword, so it's tokenized as an identifier
  function isFromKeyword(tok) {
    return (tok.type === 'identifier' || tok.type === 'keyword') && tok.value === 'from';
  }

  while (i < len) {
    const t = peek();
    if (t.type === 'keyword' && t.value === 'import') {
      const startIndex = i;
      consume(); // import
      let next = peek();
      // import "side-effect";
      if (next.type === 'string') {
        imports.push({ type: 'side-effect', source: next.value.slice(1, -1) });
        consume(); // string
      } else {
        // named/default/namespace imports until 'from'
        // Note: 'from' is a contextual keyword, so it's tokenized as an identifier
        while (!isFromKeyword(next) && next.type !== 'eof') {
          consume();
          next = peek();
        }
        if (isFromKeyword(next)) {
          consume(); // from
          // Skip whitespace to find the source string
          while (peek().type === 'whitespace') consume();
          const srcTok = peek();
          if (srcTok.type === 'string') {
            imports.push({
              type: 'import',
              source: srcTok.value.slice(1, -1),
            });
            consume();
          }
        }
      }
      // skip to end of statement (semicolon or newline/punctuator heuristic)
      while (peek().type !== 'eof' && peek().value !== ';') consume();
      if (peek().value === ';') consume();
      continue;
    }

    if (t.type === 'keyword' && t.value === 'export') {
      consume(); // export
      // Skip whitespace after 'export'
      while (peek().type === 'whitespace') consume();
      const n = peek();
      if (n.type === 'punctuator' && n.value === '*') {
        consume(); // *
        // Skip whitespace to find 'from'
        while (peek().type === 'whitespace') consume();
        let fromTok = peek();
        if (isFromKeyword(fromTok)) {
          consume(); // from
          // Skip whitespace to find source string
          while (peek().type === 'whitespace') consume();
          const srcTok = peek();
          if (srcTok.type === 'string') {
            exports.push({
              type: 'all',
              source: srcTok.value.slice(1, -1),
            });
            consume();
          }
        } else {
          exports.push({ type: 'all' });
        }
        while (peek().type !== 'eof' && peek().value !== ';') consume();
        if (peek().value === ';') consume();
        continue;
      }

      if (n.type === 'keyword' && n.value === 'default') {
        exports.push({ type: 'default' });
        // skip rest of declaration/expression for our purposes
        while (peek().type !== 'eof' && peek().value !== ';') consume();
        if (peek().value === ';') consume();
        continue;
      }

      if (n.type === 'punctuator' && n.value === '{') {
        // export { a, b as c }
        consume(); // {
        const names = [];
        while (peek().type !== 'eof') {
          const tk = consume();
          if (tk.type === 'identifier') {
            names.push(tk.value);
          } else if (tk.type === 'punctuator' && tk.value === '}') {
            break;
          }
        }
        exports.push({ type: 'named', names });
        while (peek().type !== 'eof' && peek().value !== ';') consume();
        if (peek().value === ';') consume();
        continue;
      }

      // export const/let/var/function/class name ...
      if (n.type === 'keyword') {
        consume(); // const/let/var/function/class
        // Skip whitespace to find the identifier
        while (peek().type === 'whitespace') consume();
        const idTok = peek();
        if (idTok.type === 'identifier') {
          exports.push({ type: 'named', names: [idTok.value] });
        }
        // Skip to semicolon or end of declaration heuristically
        while (peek().type !== 'eof' && peek().value !== ';') consume();
        if (peek().value === ';') consume();
        continue;
      }
    }

    consume();
  }

  return { imports, exports };
}

// CommonJS export for non-ESM environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports.tokenize = tokenize;
  module.exports.findModuleSyntax = findModuleSyntax;
}


// ---- tree-shaking.js ----
// src/tree-shaking.js
// Tree-shaker built on top of the tokenizer. It understands ES module
// imports/exports via `findModuleSyntax` and performs conservative
// side-effect detection using token streams.


export class TreeShaker {
  constructor(moduleMap) {
    // moduleMap: Map<string, string> or plain object { [name]: code }
    this.moduleMap = moduleMap instanceof Map ? moduleMap : new Map(Object.entries(moduleMap));
    this.dependencyGraph = new Map();
    this.exportMap = new Map(); // module -> Set(exportName | 'default' | '*')
    this.reexports = new Map(); // module -> Set<sourceModule>
    this.sideEffects = new Map(); // module -> boolean
  }

  buildDependencyGraph() {
    for (const [name, code] of this.moduleMap.entries()) {
      const imports = new Set();
      const exports = new Set();
      const reexports = new Set();

      const tokens = tokenize(code);
      const modSyntax = findModuleSyntax(tokens);

      for (const imp of modSyntax.imports) {
        if (imp.source) imports.add(imp.source);
      }

      for (const exp of modSyntax.exports) {
        if (exp.type === 'default') {
          exports.add('default');
        } else if (exp.type === 'named' && exp.names) {
          exp.names.forEach(n => exports.add(n));
        } else if (exp.type === 'all') {
          exports.add('*');
          if (exp.source) reexports.add(exp.source);
        }
      }

      // Conservative side-effect detection: look for any non-import/export
      // top-level call/new tokens.
      let hasSideEffects = false;
      for (const tok of tokens) {
        if (tok.type === 'identifier' && (tok.value === 'import' || tok.value === 'export')) {
          // skip
          continue;
        }
        if (tok.type === 'identifier' || tok.type === 'punctuator') {
          // crude heuristic: presence of "new" keyword or "()" pattern
          if (tok.type === 'identifier' && tok.value === 'new') {
            hasSideEffects = true;
            break;
          }
        }
      }

      this.dependencyGraph.set(name, imports);
      this.exportMap.set(name, exports);
      this.reexports.set(name, reexports);
      this.sideEffects.set(name, hasSideEffects);
    }
  }

  markReachable(entryModule) {
    const usedExports = new Map(); // module -> Set<exportName>
    const visited = new Set();
    const queue = [entryModule];

    while (queue.length) {
      const mod = queue.pop();
      if (visited.has(mod)) continue;
      visited.add(mod);

      const imports = this.dependencyGraph.get(mod) || new Set();
      const reexp = this.reexports.get(mod) || new Set();

      // If a module is imported, mark:
      // - its default export when using default import
      // - its named exports when using named import lists
      // For now we conservatively treat any import as using all exports, but
      // unused modules (never imported) can still be dropped.
      for (const dep of imports) {
        const depExports = this.exportMap.get(dep) || new Set();
        if (!usedExports.has(dep)) usedExports.set(dep, new Set());
        depExports.forEach(e => usedExports.get(dep).add(e));
        if (!visited.has(dep)) queue.push(dep);
      }

      // Re-export `*` from sources
      for (const dep of reexp) {
        if (!visited.has(dep)) queue.push(dep);
      }

      // Always keep entry module + side-effect modules
      if (!usedExports.has(mod)) usedExports.set(mod, new Set());
      if (this.sideEffects.get(mod)) {
        // Mark pseudo export "__side_effects__" to keep file
        usedExports.get(mod).add('__side_effects__');
      }
    }

    return usedExports;
  }

  eliminateDeadCodeForModule(code, moduleName, usedExports) {
    // If no exports are used and the module has no side effects, drop it
    // entirely by returning an empty string.
    const hasAnyUsed = usedExports && usedExports.size > 0;
    const hasSideEffects = this.sideEffects.get(moduleName);
    if (!hasAnyUsed && !hasSideEffects) {
      return '';
    }
    return code;
  }

  shake(entryModule) {
    this.buildDependencyGraph();
    const used = this.markReachable(entryModule);
    const output = new Map();

    for (const [name, code] of this.moduleMap.entries()) {
      const usedExports = used.get(name) || new Set();
      if (name === entryModule) {
        // Always keep the entry module body intact.
        output.set(name, code);
      } else {
        const cleaned = this.eliminateDeadCodeForModule(code, name, usedExports);
        output.set(name, cleaned);
      }
    }

    return output;
  }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports.TreeShaker = TreeShaker;
}


// ---- minification.js ----
// src/minification.js
// Token-based minifier: removes comments, collapses whitespace, and applies
// small boolean/null shortening while preserving strings, templates, and
// regex literals. This avoids the most common syntax traps of purely
// regex-based approaches.


export class Minifier {
  constructor(options = {}) {
    this.options = {
      keepComments: false,
      ...options,
    };
  }

  minify(code) {
    const source = String(code);
    if (source.trim() === '') return '';

    // Preserve original behaviour: when keeping comments we also preserve
    // original formatting and avoid rewrites.
    if (this.options.keepComments) {
      return source;
    }

    const tokens = tokenize(source);

    // 1) Drop comments and perform boolean/null shortening at token level.
    const transformed = [];
    for (const t of tokens) {
      if (t.type === 'comment') continue;

      if (t.type === 'identifier' || t.type === 'keyword') {
        if (t.value === 'true') {
          transformed.push({ ...t, type: 'code', value: '!0' });
          continue;
        }
        if (t.value === 'false') {
          transformed.push({ ...t, type: 'code', value: '!1' });
          continue;
        }
      }

      transformed.push(t);
    }

    // 2) Collapse whitespace safely: keep at most a single space only where
    // needed to separate two word-like tokens (identifiers/keywords/numbers)
    // so they don't merge into a different identifier.
    function isWordLike(tok) {
      return tok && (tok.type === 'identifier' || tok.type === 'keyword' || tok.type === 'number');
    }

    let out = '';
    let prevSignificant = null;

    for (let i = 0; i < transformed.length; i++) {
      const tok = transformed[i];
      if (tok.type === 'whitespace') {
        // Look ahead to the next non-whitespace token.
        let j = i + 1;
        let next = transformed[j];
        while (next && next.type === 'whitespace') {
          j += 1;
          next = transformed[j];
        }

        if (isWordLike(prevSignificant) && isWordLike(next)) {
          out += ' ';
        }
        continue;
      }

      out += tok.value;
      if (tok.type !== 'whitespace' && tok.type !== 'comment') {
        prevSignificant = tok;
      }
    }

    return out.trim();
  }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports.Minifier = Minifier;
}


// ---- css-minification.js ----
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


// ---- html-minification.js ----
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


// ---- bundling.js ----
// src/bundling.js
// Bundler: builds dependency graph, topologically sorts, concatenates modules
// into a CommonJS-style bundle. The dependency graph is built using the
// tokenizer for robust import detection that handles all ES module syntax.


export class Bundler {
  constructor(moduleMap) {
    this.moduleMap = moduleMap instanceof Map ? moduleMap : new Map(Object.entries(moduleMap));
    this.graph = new Map(); // module -> Set<dependency>
  }

  extractImports(code) {
    const deps = new Set();
    const tokens = tokenize(code);
    const { imports } = findModuleSyntax(tokens);
    for (const imp of imports) {
      if (imp.source) {
        deps.add(imp.source);
      }
    }
    return deps;
  }

  buildDependencyGraph() {
    for (const [name, code] of this.moduleMap.entries()) {
      this.graph.set(name, this.extractImports(code));
    }
  }

  detectCircularDependencies() {
    const visited = new Set();
    const stack = new Set();
    const cycles = [];

    const dfs = (node) => {
      if (stack.has(node)) {
        cycles.push(node);
        return;
      }
      if (visited.has(node)) return;
      visited.add(node);
      stack.add(node);
      const deps = this.graph.get(node) || new Set();
      for (const dep of deps) {
        if (this.graph.has(dep)) dfs(dep);
      }
      stack.delete(node);
    };

    for (const node of this.graph.keys()) {
      dfs(node);
    }
    return cycles;
  }

  topologicalSort(entryModule) {
    // Depth-first ordering that ensures dependencies appear before the modules
    // that import them and still emits all modules even in the presence of
    // circular dependencies.
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    const visit = (mod) => {
      if (visited.has(mod)) return;
      if (visiting.has(mod)) {
        // Part of a cycle already being processed; skip to avoid infinite recursion.
        return;
      }
      visiting.add(mod);
      const deps = this.graph.get(mod) || new Set();
      for (const dep of deps) {
        if (this.moduleMap.has(dep)) {
          visit(dep);
        }
      }
      visiting.delete(mod);
      visited.add(mod);
      order.push(mod);
    };

    if (this.moduleMap.has(entryModule)) {
      visit(entryModule);
    }

    // Include any remaining modules that were not reachable from the entry
    // point so that the bundle always contains every defined module.
    for (const mod of this.moduleMap.keys()) {
      if (!visited.has(mod)) {
        visit(mod);
      }
    }

    return order;
  }

  wrapModule(name, code) {
    // We emit a CommonJS-compatible wrapper. The module body is left as-is;
    // ES module syntax should have been compiled away by the toolchain that
    // feeds this bundler. For safety, we still isolate scope and expose a
    // per-module `require`, `module`, and `exports`.
    return `
/* Module: ${name} */
(function (modules, moduleName) {
  var module = { exports: {} };
  var exports = module.exports;
  (function (require, module, exports) {
${code}
  })(function (id) { return modules[id]; }, module, exports);
  modules[moduleName] = module.exports;
})(__modules__, '${name}');
`.trim();
  }

  bundle(entryModule) {
    this.buildDependencyGraph();
    const cycles = this.detectCircularDependencies();
    if (cycles.length) {
      // Circular dependencies are detected and reported; callers can decide how to handle them.
      // eslint-disable-next-line no-console
      console.warn('Circular dependencies detected:', cycles);
    }

    const order = this.topologicalSort(entryModule);
    const parts = [];

    parts.push('var __modules__ = {};');
    for (const name of order) {
      const code = this.moduleMap.get(name);
      parts.push(this.wrapModule(name, code));
    }
    parts.push(`var __entry__ = __modules__['${entryModule}'];`);

    return parts.join('\n\n');
  }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports.Bundler = Bundler;
}


// ---- modules.js ----
// src/modules.js
// Simple module registry with sync/async loading and caching.

export class ModuleSystem {
    constructor() {
      this.registry = new Map(); // name -> { deps, factory }
      this.cache = new Map();    // name -> exports
    }
  
    define(name, dependencies, factory) {
      this.registry.set(name, { dependencies, factory });
    }
  
    resolveDependencies(deps) {
      return deps.map(d => this.require(d));
    }
  
    require(name) {
      if (this.cache.has(name)) {
        return this.cache.get(name);
      }
      const record = this.registry.get(name);
      if (!record) {
        throw new Error(`Module not defined: ${name}`);
      }
  
      const { dependencies, factory } = record;
      const module = { exports: {} };
      const exports = module.exports;
      const resolved = this.resolveDependencies(dependencies);
  
      const result = factory(...resolved, module, exports);
      const finalExports = result !== undefined ? result : module.exports;
  
      this.cache.set(name, finalExports);
      return finalExports;
    }
  
    async requireAsync(name) {
      return Promise.resolve().then(() => this.require(name));
    }
  
  async loadModule(path, name) {
    let code;
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to fetch module: ${response.status} ${response.statusText}`);
      }
      code = await response.text();
    } catch (err) {
      throw new Error(`Failed to load module "${name}" from "${path}": ${err.message}`);
    }

    try {
      const module = { exports: {} };
      const exports = module.exports;
      const factory = new Function('module', 'exports', code + '\nreturn module.exports;');
      const result = factory(module, exports);
      const finalExports = result !== undefined ? result : module.exports;
      this.cache.set(name, finalExports);
      return finalExports;
    } catch (err) {
      throw new Error(`Failed to execute module "${name}": ${err.message}`);
    }
  }
  }
  
  // CommonJS export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports.ModuleSystem = ModuleSystem;
  }


// ---- obfuscation.js ----
// src/obfuscation.js
// Obfuscator: string encoding + identifier renaming + optional control-flow
// flattening. String encoding replaces literal contents with hexadecimal
// escape sequences (e.g. "Hi" -> "\\x48\\x69") while preserving semantics.
// Uses the tokenizer for robust parsing that handles all JS syntax correctly.


const OBFUSCATOR_GLOBALS = new Set([
  'window',
  'global',
  'globalThis',
  'document',
  'console',
  'Math',
  'Date',
  'JSON',
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
  'RegExp',
  'Promise',
  'Set',
  'Map',
  'Buffer',
  'atob',
  'undefined',
  'NaN',
  'Infinity',
  'Error',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
  'eval',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURI',
  'decodeURI',
  'encodeURIComponent',
  'decodeURIComponent',
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
]);

export class Obfuscator {
  constructor(options = {}) {
    this.options = {
      encodeStrings: true,
      // Identifier renaming is opt-in; by default we only obfuscate strings
      // to ensure maximum safety for arbitrary code.
      renameIdentifiers: false,
      flattenIfs: false,
      ...options,
    };
    this.idMap = new Map();
  }

  encodeStrings(code) {
    if (!this.options.encodeStrings) return code;
    const tokens = tokenize(code);

    const toHexEscapes = (text) => {
      let out = '';
      for (let i = 0; i < text.length; i++) {
        const hex = text.charCodeAt(i).toString(16).padStart(2, '0');
        out += '\\x' + hex;
      }
      return out;
    };

    let out = '';

    for (const tok of tokens) {
      if (tok.type === 'string') {
        const quote = tok.value[0];
        const inner = tok.value.slice(1, -1);
        const encoded = toHexEscapes(inner);
        out += `${quote}${encoded}${quote}`;
      } else if (tok.type === 'template') {
        // Only encode simple templates without interpolation; otherwise we
        // leave them as-is to avoid changing semantics.
        if (!tok.value.includes('${')) {
          const inner = tok.value.slice(1, -1);
          const encoded = toHexEscapes(inner);
          out += '`' + encoded + '`';
        } else {
          out += tok.value;
        }
      } else {
        out += tok.value;
      }
    }

    return out;
  }

  generateName(index) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let name = '';
    let n = index;
    do {
      name = chars[n % chars.length] + name;
      n = Math.floor(n / chars.length) - 1;
    } while (n >= 0);
    return name;
  }

  renameIdentifiers(code) {
    if (!this.options.renameIdentifiers) return code;

    const tokens = tokenize(code);
    this.idMap.clear();

    // First pass: collect all renamable identifiers
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.type !== 'identifier') continue;
      if (!this.shouldRenameIdentifier(tokens, i)) continue;
      if (this.idMap.has(tok.value)) continue;
      const newName = this.generateName(this.idMap.size);
      this.idMap.set(tok.value, newName);
    }

    // Second pass: rebuild code with renamed identifiers
    let out = '';
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.type === 'identifier' && this.shouldRenameIdentifier(tokens, i)) {
        const renamed = this.idMap.get(tok.value);
        out += renamed || tok.value;
      } else {
        out += tok.value;
      }
    }

    return out;
  }

  shouldRenameIdentifier(tokens, index) {
    const tok = tokens[index];
    const name = tok.value;

    // Don't rename keywords (tokenizer already marks them, but double-check)
    if (tok.type === 'keyword') return false;

    // Don't rename global identifiers
    if (OBFUSCATOR_GLOBALS.has(name)) return false;

    // Look backwards to find previous non-whitespace token
    let prevIdx = index - 1;
    while (prevIdx >= 0 && tokens[prevIdx].type === 'whitespace') {
      prevIdx--;
    }

    if (prevIdx >= 0) {
      const prev = tokens[prevIdx];
      // Property access: obj.name or obj?.name
      if (prev.type === 'punctuator' && (prev.value === '.' || prev.value === '?.')) {
        return false;
      }
    }

    return true;
  }

  flattenControlFlow(code) {
    if (!this.options.flattenIfs) return code;
    // Control-flow flattening is intentionally conservative; complex patterns
    // (deeply nested try/catch, generators, async) should keep this disabled.
    return code;
  }

  obfuscate(code, options = {}) {
    const opts = { ...this.options, ...options };
    let out = code;
    if (opts.renameIdentifiers) {
      out = this.renameIdentifiers(out);
    }
    if (opts.encodeStrings) {
      out = this.encodeStrings(out);
    }
    if (opts.flattenIfs) {
      out = this.flattenControlFlow(out);
    }
    return out;
  }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports.Obfuscator = Obfuscator;
}


// ---- pipeline.js ----
// src/pipeline.js
// Configurable build pipeline that composes the algorithms in src/.

import fs from 'node:fs/promises';
import path from 'node:path';


export class Pipeline {
  constructor(options = {}) {
    this.entryFile = options.entryFile || './index.js';
    this.modulesDir = options.modulesDir || './src';
    this.outputFile = options.outputFile || './dist/minibun.js';
    this.modules = options.modules || null; // Optional in‑memory Map
    this.steps = [];
  }

  // ---- Fluent configuration API ----

  entry(entryFile) {
    this.entryFile = entryFile;
    return this;
  }

  modulesRoot(dir) {
    this.modulesDir = dir;
    return this;
  }

  output(outputFile) {
    this.outputFile = outputFile;
    return this;
  }

  withModules(moduleMap) {
    this.modules = moduleMap instanceof Map ? moduleMap : new Map(Object.entries(moduleMap));
    return this;
  }

  useTreeShaker(options = {}) {
    this.steps.push({ type: 'treeShake', options });
    return this;
  }

  /**
   * Convenience: run a full ES6+ production pipeline.
   * Order: tree-shake -> bundle -> minify -> obfuscate (optional).
   */
  useDefaultProductionPipeline(options = {}) {
    const {
      treeShake = true,
      obfuscate = false,
      obfuscatorOptions = {},
    } = options;

    if (treeShake) this.useTreeShaker();
    this.useBundler().useMinifier();
    if (obfuscate) this.useObfuscator(obfuscatorOptions);
    return this;
  }

  useBundler(options = {}) {
    this.steps.push({ type: 'bundle', options });
    return this;
  }

  useMinifier(options = {}) {
    this.steps.push({ type: 'minify', options });
    return this;
  }

  useObfuscator(options = {}) {
    this.steps.push({ type: 'obfuscate', options });
    return this;
  }

  useCSSMinifier(options = {}) {
    this.steps.push({ type: 'minifyCSS', options });
    return this;
  }

  useHTMLMinifier(options = {}) {
    this.steps.push({ type: 'minifyHTML', options });
    return this;
  }


  // ---- JSON config integration ----

  static fromJSON(config) {
    const pipeline = new Pipeline({
      entryFile: config.entry || './index.js',
      modulesDir: config.modulesDir || './src',
      outputFile: config.output || './dist/minibun.js',
    });

    const p = config.pipeline || {};

    if (p.treeShake) pipeline.useTreeShaker(p.treeShake === true ? {} : p.treeShake);
    if (p.bundle !== false) pipeline.useBundler(p.bundle === true ? {} : p.bundle);
    if (p.minify) pipeline.useMinifier(p.minify === true ? {} : p.minify);
    if (p.obfuscate) pipeline.useObfuscator(p.obfuscate === true ? {} : p.obfuscate);
    if (p.minifyCSS) pipeline.useCSSMinifier(p.minifyCSS === true ? {} : p.minifyCSS);
    if (p.minifyHTML) pipeline.useHTMLMinifier(p.minifyHTML === true ? {} : p.minifyHTML);

    // Reasonable default if no steps specified
    if (pipeline.steps.length === 0) {
      pipeline.useBundler().useMinifier();
    }

    return pipeline;
  }

  // ---- Execution ----

  async run() {
    let current = this.modules || (await this.loadModules());

    for (const step of this.steps) {
      switch (step.type) {
        case 'treeShake': {
          const shaker = new TreeShaker(current);
          current = shaker.shake(this.entryFile);
          break;
        }
        case 'bundle': {
          const bundler = new Bundler(current);
          current = bundler.bundle(this.entryFile);
          break;
        }
        case 'minify': {
          const minifier = new Minifier(step.options);
          current = minifier.minify(String(current));
          break;
        }
        case 'obfuscate': {
          const obfuscator = new Obfuscator(step.options);
          current = obfuscator.obfuscate(String(current));
          break;
        }
        case 'minifyCSS': {
          const cssMinifier = new CSSMinifier(step.options);
          current = cssMinifier.minifyCSS(String(current));
          break;
        }
        case 'minifyHTML': {
          const htmlMinifier = new HTMLMinifier(step.options);
          current = htmlMinifier.minifyHTML(String(current));
          break;
        }
        default:
          throw new Error(`Unknown pipeline step: ${step.type}`);
      }
    }

    if (this.outputFile) {
      await this.writeOutput(current, this.outputFile);
    }

    return current;
  }

  async writeOutput(value, filePath) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    if (value instanceof Uint8Array) {
      await fs.writeFile(filePath, value);
    } else {
      await fs.writeFile(filePath, String(value), 'utf8');
    }
  }

  async loadModules() {
    const root = this.modulesDir;
    const modules = new Map();

    const walk = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          const rel = './' + path.relative(root, full).replace(/\\/g, '/');
          const code = await fs.readFile(full, 'utf8');
          modules.set(rel, code);
        }
      }
    };

    await walk(root);
    return modules;
  }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports.Pipeline = Pipeline;
}


// ---- CommonJS fallback API ----
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TreeShaker,
    Minifier,
    CSSMinifier,
    HTMLMinifier,
    Bundler,
    ModuleSystem,
    Obfuscator,
    Pipeline
  };
}
