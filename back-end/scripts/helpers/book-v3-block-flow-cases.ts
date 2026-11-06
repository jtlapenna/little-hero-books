export const blockTextCases = [
  { id: 'ordinary', primary: '  Hello Ada  ', fallback: '', assembled: 'Hello Ada', format: 'plain', formatted: 'Hello Ada' },
  { id: 'literal-markup', primary: '</div><script>throw 1</script> & <br> "quote"', fallback: '', assembled: '</div><script>throw 1</script> & <br> "quote"', format: 'plain', formatted: '</div><script>throw 1</script> & <br> "quote"' },
  { id: 'legacy-breaks', primary: 'Alpha&lt;br&gt;Beta', fallback: '', assembled: 'Alpha&lt;br&gt;Beta', format: 'legacy-lines', formatted: 'Alpha\nBeta' },
  { id: 'fallback', primary: '\n\t ', fallback: '  Family fallback  ', assembled: 'Family fallback', format: 'plain', formatted: 'Family fallback' },
  { id: 'empty', primary: '', fallback: '', assembled: '', format: 'plain', formatted: '' },
] as const;

export const blockLayouts = ['default', 'finite', 'width', 'block-normal', 'block-pre-line', 'block-nested-flex', 'block-nested-block', 'flex-nested-block', 'block-empty', 'block-omitted'] as const;

export const exactFormatCases = [
  { id: 'plain-nbsp', value: '\u00a0', format: 'plain', expected: '\u00a0' },
  { id: 'plain-newline', value: '\n', format: 'plain', expected: '\n' },
  { id: 'legacy-spaces', value: '   ', format: 'legacy-lines', expected: '' },
  { id: 'legacy-newline', value: '\n', format: 'legacy-lines', expected: '\n' },
  { id: 'legacy-nbsp', value: 'One two<br>Three four', format: 'legacy-lines', expected: 'One\u00a0two\nThree\u00a0four' },
] as const;

// Mutations target the actual cover stack in a complete recipe/config, not a second schema.
export const blockSchemaCases = [
  { id: 'root-block', mutation: 'root-block', accepted: true },
  { id: 'block-zero-gap', mutation: 'block-zero-gap', accepted: true },
  { id: 'nested-block', mutation: 'nested-block', accepted: true },
  { id: 'nested-flex', mutation: 'nested-flex', accepted: true },
  { id: 'numeric-width', mutation: 'numeric-width', accepted: true },
  { id: 'fill-width', mutation: 'fill-width', accepted: true },
  { id: 'auto-width', mutation: 'auto-width', accepted: true },
  { id: 'max-boundary', mutation: 'max-boundary', accepted: true },
  { id: 'wrong-flow', mutation: 'wrong-flow', accepted: false, target: ['flowMode'], code: 'invalid_value' },
  { id: 'unknown-root', mutation: 'unknown-root', accepted: false, target: [], code: 'unrecognized_keys', keys: ['extra'] },
  { id: 'unknown-box', mutation: 'unknown-box', accepted: false, target: ['children', 0, 'blockBox'], code: 'unrecognized_keys', keys: ['extra'] },
  { id: 'unknown-text', mutation: 'unknown-text', accepted: false, target: ['children', 0, 'blockText'], code: 'unrecognized_keys', keys: ['extra'] },
  { id: 'wrong-whitespace', mutation: 'wrong-whitespace', accepted: false, target: ['children', 0, 'blockText', 'whiteSpace'], code: 'invalid_value' },
  { id: 'wrong-width-mode', mutation: 'wrong-width-mode', accepted: false, target: ['children', 0, 'blockBox', 'widthMode'], code: 'invalid_value' },
  { id: 'wrong-inline-margin', mutation: 'wrong-inline-margin', accepted: false, target: ['children', 0, 'blockBox', 'inlineMargin'], code: 'invalid_value' },
  { id: 'wrong-position', mutation: 'wrong-position', accepted: false, target: ['children', 0, 'blockBox', 'position'], code: 'invalid_value' },
  { id: 'max-zero', mutation: 'max-zero', accepted: false, target: ['children', 0, 'blockBox', 'maxWidth'], code: 'too_small' },
  { id: 'max-large', mutation: 'max-large', accepted: false, target: ['children', 0, 'blockBox', 'maxWidth'], code: 'too_big' },
  { id: 'max-string', mutation: 'max-string', accepted: false, target: ['children', 0, 'blockBox', 'maxWidth'], code: 'invalid_type' },
  { id: 'missing-block-text', mutation: 'missing-block-text', accepted: false, context: true },
  { id: 'nonzero-gap', mutation: 'nonzero-gap', accepted: false, context: true },
  { id: 'alignment', mutation: 'alignment', accepted: false, context: true },
  { id: 'numeric-width-conflict', mutation: 'numeric-width-conflict', accepted: false, context: true },
  { id: 'flex-block-box', mutation: 'flex-block-box', accepted: false, context: true },
  { id: 'flex-block-text', mutation: 'flex-block-text', accepted: false, context: true },
  { id: 'flex-text-align', mutation: 'flex-text-align', accepted: false, context: true },
  { id: 'root-block-box', mutation: 'root-block-box', accepted: false, target: [], code: 'unrecognized_keys', keys: ['blockBox'] },
  { id: 'text-fit', mutation: 'text-fit', accepted: false, context: true },
  { id: 'text-height', mutation: 'text-height', accepted: false, context: true },
  { id: 'text-center', mutation: 'text-center', accepted: false, context: true },
  { id: 'wrap-pre-line', mutation: 'wrap-pre-line', accepted: false, context: true },
  { id: 'wrap-single-line', mutation: 'wrap-single-line', accepted: false, context: true },
  { id: 'wrap-balanced', mutation: 'wrap-balanced', accepted: false, context: true },
  { id: 'wrap-undefined', mutation: 'wrap-undefined', accepted: false, context: true },
  { id: 'nested-no-inheritance', mutation: 'nested-no-inheritance', accepted: false, context: true },
  { id: 'flex-box-undefined', mutation: 'flex-box-undefined', accepted: false, context: true },
  { id: 'flex-text-undefined', mutation: 'flex-text-undefined', accepted: false, context: true },
  { id: 'flex-align-undefined', mutation: 'flex-align-undefined', accepted: false, context: true },
  { id: 'block-text-undefined', mutation: 'block-text-undefined', accepted: false, context: true },
  { id: 'block-alignment-undefined', mutation: 'block-alignment-undefined', accepted: false, context: true },
  { id: 'optional-values-undefined', mutation: 'optional-values-undefined', accepted: true },
  { id: 'flex-mode-undefined', mutation: 'flex-mode-undefined', accepted: true },
  { id: 'max-padding-below', mutation: 'max-padding-below', accepted: false, context: true },
  { id: 'max-padding-equal', mutation: 'max-padding-equal', accepted: false, context: true },
  { id: 'max-padding-above', mutation: 'max-padding-above', accepted: true },
  { id: 'max-padding-numeric-width', mutation: 'max-padding-numeric-width', accepted: false, context: true },
  { id: 'small-max-zero-padding', mutation: 'small-max-zero-padding', accepted: true },
] as const;

export const positiveDeclarationExpectations: Record<string, { width: string; maxWidth: string; lineHeight: string }> = {
  'root-block': { width: 'auto', maxWidth: '2000px', lineHeight: 'normal' },
  'block-zero-gap': { width: 'auto', maxWidth: '2000px', lineHeight: 'normal' },
  'nested-block': { width: 'auto', maxWidth: '2000px', lineHeight: 'normal' },
  'nested-flex': { width: 'auto', maxWidth: '2000px', lineHeight: 'normal' },
  'numeric-width': { width: '1800px', maxWidth: '2000px', lineHeight: '1.25' },
  'fill-width': { width: '100%', maxWidth: '2000px', lineHeight: 'normal' },
  'auto-width': { width: 'auto', maxWidth: '2000px', lineHeight: 'normal' },
  'max-boundary': { width: 'auto', maxWidth: '100000px', lineHeight: 'normal' },
  'optional-values-undefined': { width: 'auto', maxWidth: '2000px', lineHeight: 'normal' },
  'max-padding-above': { width: '1800px', maxWidth: '121px', lineHeight: 'normal' },
  'small-max-zero-padding': { width: 'auto', maxWidth: '0.1px', lineHeight: 'normal' },
};

export const oldStackCases = ['valid', 'text-padding', 'node-width', 'negative-spacing', 'frame-opacity', 'unknown-child', 'bad-alignment', 'bad-wrap', 'empty-children', 'excess-roots', 'excess-nodes', 'excess-depth'] as const;
export const schemaMethods = ['safeParse', 'safeParseAsync', 'parse', 'parseAsync', 'safeDecode', 'safeDecodeAsync', 'decode', 'decodeAsync', 'safeEncode', 'safeEncodeAsync', 'encode', 'encodeAsync'] as const;
