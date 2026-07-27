import { Parser, Language } from 'web-tree-sitter';

// Real C++ tokenizing/parsing, not regex -- Arduino/C++ syntax (nested
// expressions, operator precedence, matching braces, string/char literal
// escaping, comments, etc.) can't be reliably recognized with string
// matching, and this app doesn't need to invent its own C++ grammar either:
// tree-sitter is a real, actively-maintained, widely-used incremental
// parsing library (its C++ grammar is what GitHub itself uses for syntax
// highlighting), and `web-tree-sitter` is its official WASM/JS binding --
// runs entirely in the browser, no native compilation, no backend round
// trip needed just to parse pasted code.
//
// Both `web-tree-sitter.wasm` (the tree-sitter runtime itself) and
// `tree-sitter-cpp.wasm` (the C++ grammar, prebuilt -- extracted from the
// `tree-sitter-cpp` npm package rather than added as a dependency, since
// that package's own 42MB is almost entirely native-binding build tooling
// this browser-only use never touches) are committed directly under
// frontend/public/ rather than relying on a postinstall copy step: this
// repo's exact Render build command isn't configured in-repo (see README),
// so a committed binary is more reliable than trusting a lifecycle script
// fires correctly in an environment this project can't directly verify.
// Re-copy `public/web-tree-sitter.wasm` from node_modules/web-tree-sitter
// if that dependency is ever upgraded.
let languagePromise = null;

export function getCppLanguage() {
  if (!languagePromise) {
    languagePromise = Parser.init({
      // Forces the runtime to fetch web-tree-sitter.wasm from the site
      // root regardless of where Vite ends up serving the JS chunk that
      // imports this module from -- true in both `vite dev` and the built
      // production static site, since `public/` is always served at `/`.
      locateFile: (path) => `/${path}`,
    }).then(() => Language.load('/tree-sitter-cpp.wasm'));
  }
  return languagePromise;
}

export async function parseCpp(sourceText) {
  const language = await getCppLanguage();
  const parser = new Parser();
  parser.setLanguage(language);
  return parser.parse(sourceText);
}
