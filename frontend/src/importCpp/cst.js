// Thin helpers over web-tree-sitter's Node API, used throughout the
// recognizer modules -- nothing here is Arduino/Blockly-specific, just
// generic tree-walking conveniences.

export function line(node) {
  return node.startPosition.row + 1;
}

export function column(node) {
  return node.startPosition.column + 1;
}

// Unwraps a single layer of parentheses, if present -- so
// `digitalWrite((13), HIGH)` recognizes the same as `digitalWrite(13, HIGH)`.
// Repeats in case of multiple nested layers, e.g. `((13))`.
export function unwrapParens(node) {
  let n = node;
  while (n && n.type === 'parenthesized_expression' && n.namedChildCount === 1) {
    n = n.namedChild(0);
  }
  return n;
}

// `if (x)` / `while (x)` wrap their condition in a `condition_clause` node
// with a `value` field -- `for (;cond;)` does not, its condition is bare.
// This handles both so callers never need to know which construct they're
// looking at.
export function conditionValue(node) {
  if (!node) return null;
  if (node.type === 'condition_clause') return unwrapParens(node.childForFieldName('value'));
  return unwrapParens(node);
}
