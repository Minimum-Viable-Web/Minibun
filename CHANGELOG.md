# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2025-02-25

### Added
- **CSS Minification** (`CSSMinifier`) — new zero-dependency CSS minifier that removes comments, collapses whitespace, strips unnecessary characters, and preserves quoted string literals.
- Pipeline integration: `useCSSMinifier()` fluent method and `minifyCSS` JSON config key.
- Full test suite for CSS minification (7 test cases).

## [1.0.7] - 2025-01-28

### Changed
- Bump version number to release package.

## [1.0.6] - 2025-01-28

### Changed
- Republished under `@minimum-viable-web` org scope.

## [1.0.5] - 2025-01-27

### Added
- Release automation workflows (GitHub Actions).

### Changed
- Updated bundler logic to utilize tokenizer for import detection.
- Simplified package name.

## [1.0.0] - 2025-01-26

### Added
- Initial release.
- Tree-shaking (`TreeShaker`) with dependency graph analysis.
- JS Minification (`Minifier`) with token-based comment/whitespace removal and boolean shortening.
- Bundling (`Bundler`) with topological sort and CommonJS module wrapping.
- Module system (`ModuleSystem`) with runtime caching.
- Obfuscation (`Obfuscator`) with hex string encoding and identifier renaming.
- Configurable `Pipeline` with fluent API and JSON config support.
- Tokenizing parser (`tokenize` / `findModuleSyntax`) for ES6+ source analysis.
