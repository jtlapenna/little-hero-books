export const widthTextCases = [
  { id: 'ordinary', primary: '  Hello Ada  ', fallback: '', assembled: 'Hello Ada', format: 'plain', formatted: 'Hello Ada' },
  { id: 'escaped-selector', primary: '</script><script>throw 1</script><span data-lhb-v3-fit="width-only"> & x', fallback: '', assembled: '</script><script>throw 1</script><span data-lhb-v3-fit="width-only"> & x', format: 'plain', formatted: '</script><script>throw 1</script><span data-lhb-v3-fit="width-only"> & x' },
  { id: 'legacy-break', primary: 'Alpha&lt;br&gt;Beta', fallback: '', assembled: 'Alpha&lt;br&gt;Beta', format: 'legacy-lines', formatted: 'Alpha\nBeta' },
  { id: 'fallback', primary: '\n\t ', fallback: '  Family fallback  ', assembled: 'Family fallback', format: 'plain', formatted: 'Family fallback' },
  { id: 'empty', primary: '', fallback: '', assembled: '', format: 'plain', formatted: '' },
] as const;

export const widthSchemaCases = [
  { id: 'computed', fit: { mode: 'width-only' }, accept: true },
  { id: 'explicit', fit: { mode: 'width-only', maxFontSize: 120, softMinFontSize: 60 }, accept: true },
  { id: 'soft-without-max', fit: { mode: 'width-only', softMinFontSize: 60 }, accept: true },
  { id: 'soft-above-max', fit: { mode: 'width-only', maxFontSize: 20, softMinFontSize: 60 }, accept: true },
  { id: 'fractional-below-threshold', fit: { mode: 'width-only', maxFontSize: 23.2 }, accept: true },
  { id: 'upper-bound', fit: { mode: 'width-only', maxFontSize: 512, softMinFontSize: 512 }, accept: true },
  { id: 'forbidden-min', fit: { mode: 'width-only', minFontSize: 24 }, accept: false },
  { id: 'extra-key', fit: { mode: 'width-only', extra: true }, accept: false },
  { id: 'max-zero', fit: { mode: 'width-only', maxFontSize: 0 }, accept: false },
  { id: 'max-negative', fit: { mode: 'width-only', maxFontSize: -1 }, accept: false },
  { id: 'max-too-large', fit: { mode: 'width-only', maxFontSize: 512.1 }, accept: false },
  { id: 'max-null', fit: { mode: 'width-only', maxFontSize: null }, accept: false },
  { id: 'max-string', fit: { mode: 'width-only', maxFontSize: '120' }, accept: false },
  { id: 'soft-zero', fit: { mode: 'width-only', softMinFontSize: 0 }, accept: false },
  { id: 'soft-too-large', fit: { mode: 'width-only', softMinFontSize: 513 }, accept: false },
  { id: 'soft-null', fit: { mode: 'width-only', softMinFontSize: null }, accept: false },
  { id: 'wrong-mode', fit: { mode: 'width-ONLY', minFontSize: 24, maxFontSize: 120 }, accept: false },
] as const;

export const fixedFitErrorCases = [
  { id: 'missing-min', fit: { maxFontSize: 120 } },
  { id: 'missing-max', fit: { minFontSize: 24 } },
  { id: 'minimum-zero', fit: { minFontSize: 0, maxFontSize: 120 } },
  { id: 'maximum-too-large', fit: { minFontSize: 24, maxFontSize: 513 } },
  { id: 'inconsistent', fit: { minFontSize: 60, maxFontSize: 40 } },
  { id: 'soft-inconsistent', fit: { minFontSize: 24, maxFontSize: 120, softMinFontSize: 20 } },
  { id: 'unknown-key', fit: { minFontSize: 24, maxFontSize: 120, extra: true } },
  { id: 'unknown-mode', fit: { mode: 'unknown', minFontSize: 24, maxFontSize: 120 } },
  { id: 'combined-continuable', fit: { minFontSize: 0, maxFontSize: 120 }, combined: true },
  { id: 'combined-refinement', fit: { minFontSize: 60, maxFontSize: 40 }, combined: true },
] as const;

export const widthVmCases = [
  { id: 'computed-two-passes', max: null, initial: 120, widths: [600, 900], scale: 10, final: 60, secondStart: 60, status: 'fit' },
  { id: 'explicit-two-passes', max: 120, initial: 80, widths: [600, 900], scale: 10, final: 90, secondStart: 120, status: 'fit' },
  { id: 'fractional-threshold', max: null, initial: 24.2, widths: [0, 0], scale: 10, final: 23.2, secondStart: 23.2, status: 'overflow' },
  { id: 'below-threshold', max: 20, initial: 80, widths: [0, 0], scale: 10, final: 20, secondStart: 20, status: 'overflow' },
  { id: 'rectangle-fallback', parentWidths: [1000, 1000], max: 80, initial: 80, widths: [400, 400], clientZero: true, scale: 10, final: 40, secondStart: 80, status: 'fit' },
  { id: 'padding-not-subtracted', max: 80, initial: 80, widths: [800, 800], padding: 40, scale: 10, final: 80, secondStart: 80, status: 'fit' },
  { id: 'half-pixel', max: 80, initial: 80, widths: [799.5, 799.5], scale: 10, final: 80, secondStart: 80, status: 'fit' },
  { id: 'outside-half-pixel', max: 80, initial: 80, widths: [799.49, 799.49], scale: 10, final: 79, secondStart: 80, status: 'fit' },
  { id: 'zero-empty', max: 80, initial: 80, widths: [0, 0], scale: 0, final: 80, secondStart: 80, status: 'fit' },
  { id: 'sticky-soft', max: 80, initial: 80, soft: 60, widths: [400, 1000], scale: 10, final: 80, secondStart: 80, status: 'soft-min-exceeded', stickySoft: true },
  { id: 'sticky-overflow', max: 26, initial: 80, widths: [0, 1000], scale: 10, final: 26, secondStart: 26, status: 'overflow', stickyOverflow: true },
  { id: 'self-container', parentWidths: [1000, 1000], max: 80, initial: 80, widths: [400, 400], selfContainer: true, scale: 10, final: 40, secondStart: 80, status: 'fit' },
  { id: 'unmarked-parent', max: 80, initial: 80, widths: [400, 400], parentOnly: true, scale: 10, final: 40, secondStart: 80, status: 'fit' },
] as const;
