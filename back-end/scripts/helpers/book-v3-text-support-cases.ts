export const visibilityCases = [
  { id: 'empty-plain', input: '', format: 'plain', formatted: '', omit: true },
  { id: 'nbsp-plain', input: '\u00a0', format: 'plain', formatted: '\u00a0', omit: false },
  { id: 'nbsp-legacy', input: '\u00a0', format: 'legacy-lines', formatted: '', omit: true },
  { id: 'space-plain', input: ' ', format: 'plain', formatted: ' ', omit: false },
  { id: 'whitespace-plain', input: ' \t ', format: 'plain', formatted: ' \t ', omit: false },
  { id: 'whitespace-legacy', input: ' \t ', format: 'legacy-lines', formatted: '', omit: true },
  { id: 'newline-legacy', input: '\n', format: 'legacy-lines', formatted: '\n', omit: false },
  { id: 'br-legacy', input: '<br>', format: 'legacy-lines', formatted: '\n', omit: false },
  { id: 'escaped', input: '<script>&"\'x', format: 'plain', formatted: '<script>&"\'x', omit: false },
  { id: 'format-after-interpolation', input: ' Hello x ', format: 'legacy-lines', formatted: 'Hello\u00a0x', omit: false },
] as const;

export const pipelineCases = [
  { id: 'ordinary', primary: '  Hello <Ada> & x  ', manifest: '', assemblyText: 'Hello <Ada> & x', format: 'plain', formatted: 'Hello <Ada> & x' },
  { id: 'fallback', primary: '   ', manifest: '  From family  ', assemblyText: 'From family', format: 'plain', formatted: 'From family' },
  { id: 'empty', primary: '', manifest: '', assemblyText: '', format: 'plain', formatted: '' },
  { id: 'whitespace-trimmed', primary: ' \t ', manifest: '', assemblyText: '', format: 'legacy-lines', formatted: '' },
  { id: 'newline-trimmed-fallback', primary: '\n', manifest: '  Family fallback  ', assemblyText: 'Family fallback', format: 'plain', formatted: 'Family fallback' },
  { id: 'literal-br', primary: 'Alpha<br>Beta', manifest: '', assemblyText: 'Alpha<br>Beta', format: 'legacy-lines', formatted: 'Alpha\nBeta' },
  { id: 'encoded-br', primary: 'Alpha&lt;br&gt;Beta', manifest: '', assemblyText: 'Alpha&lt;br&gt;Beta', format: 'legacy-lines', formatted: 'Alpha\nBeta' },
  { id: 'br-only', primary: '<br>', manifest: '', assemblyText: '<br>', format: 'legacy-lines', formatted: '\n' },
] as const;
