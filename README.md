# Minibun - A tiny javascript bundler implementation.

[![Publish to GitHub Packages](https://github.com/Minimum-Viable-Web/Minibun/actions/workflows/publish.yml/badge.svg)](https://github.com/Minimum-Viable-Web/Minibun/actions/workflows/publish.yml)
[![Create Release on Version Change](https://github.com/Minimum-Viable-Web/Minibun/actions/workflows/release.yml/badge.svg)](https://github.com/Minimum-Viable-Web/Minibun/actions/workflows/release.yml)
[![GitHub Package](https://img.shields.io/badge/GitHub-Package-blue.svg)](https://github.com/Minimum-Viable-Web/Minibun/packages)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-green.svg)](https://github.com/Minimum-Viable-Web/Minibun)

> ⚠️ **EXPERIMENTAL** – See Scope & limitations

---
## Looking for a tiny web development ecosystem? See: [Minimum Viable Web](https://github.com/Minimum-Viable-Web)
---

## Minibun features: 

- Tree-shaking (`TreeShaker`)
- JS Minification (`Minifier`)
- CSS Minification (`CSSMinifier`)
- Bundling (`Bundler`)
- Module system (`ModuleSystem`)
- Obfuscation (`Obfuscator`)
- Tokenizing parser (`tokenize` / `findModuleSyntax`)

### Installation

Install from GitHub Packages:

```bash
npm install @minimum-viable-web/minibun
```

**Note:** You'll need to authenticate with GitHub Packages. Create a `.npmrc` file in your project root:

```
@minimum-viable-web:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

Or set the `GITHUB_TOKEN` environment variable. You can create a Personal Access Token with `read:packages` permission at [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens).

### Usage (ESM)

```js
import {
  TreeShaker,
  Minifier,
  CSSMinifier,
  Bundler,
  ModuleSystem,
  Obfuscator,
  Pipeline,
} from '@minimum-viable-web/minibun';
```

#### CSS Minification

```js
import { CSSMinifier } from '@minimum-viable-web/minibun';

const minifier = new CSSMinifier();
const output = minifier.minifyCSS(`
  /* Main styles */
  .card {
    color: red;
    padding: 10px;
  }
`);
// Output: ".card{color:red;padding:10px}"
```

The `CSSMinifier` removes comments, collapses whitespace, strips unnecessary spaces around `{}:;,`, and removes trailing semicolons — while preserving quoted string literals (e.g. `content: "..."`, `url("...")`).

Options:
- `keepComments: true` — preserve original formatting (no minification)

Pipeline integration:

```js
const pipeline = new Pipeline({ outputFile: '' })
  .withModules(modules)
  .useCSSMinifier();

// Or via JSON config:
Pipeline.fromJSON({ pipeline: { minifyCSS: true } });
```

### Development

**Build the main bundle:**
```bash
npm run build
```

**Build all variants** (minified, obfuscated, minified+obfuscated):
```bash
npm run build:test
```

**Run tests:**
```bash
npm test
```

### Publishing

This package is published to GitHub Packages. To publish a new version:

1. **Manual Publishing:**
   ```bash
   npm login --registry=https://npm.pkg.github.com --scope=@minimum-viable-web
   npm publish
   ```

2. **Automated Publishing:**
   - Create a GitHub Release, or
   - Use the "Publish to GitHub Packages" workflow from the Actions tab
   - The workflow will automatically build, test, and publish the package

### Project Structure

- **`src/`** - Primary source code (modular, maintainable)
  - Edit files here when making changes
  - Tests import directly from `src/` modules
- **`dist/`** - Generated build artifacts (do not edit directly)
  - `minibun.js` - Main single-file bundle
  - `minibun-min.js` - Minified variant
  - `minibun-obf.js` - Obfuscated variant (hex-encoded strings)
  - `minibun-min-obf.js` - Minified + obfuscated variant
  - Regenerate with `npm run build` or `npm run build:test`

### Scope and limitations

- Algorithms are implemented with a lightweight **tokenizer**.
- The tokenizer handles strings, templates, comments, regex literals, and all ES6+ syntax, but there is **no full AST** — tokens are emitted in sequence without expression parsing.
- CSS minification uses a regex-based approach (no tokenizer needed) that handles standard CSS including `@`-rules, nested blocks, and quoted strings.
- Suitable for **controlled ES6+ codebases** with static module structure:
  - Only **static `import`/`export`** with literal specifiers (no `import()` dynamic imports).
  - No analysis of runtime-evaluated code (`eval`, `new Function()`, `with`).
  - Tree-shaking uses conservative heuristics; modules with detected side effects are preserved.
- For production builds of arbitrary JavaScript, use established tools (esbuild, Rollup, Terser) instead.
