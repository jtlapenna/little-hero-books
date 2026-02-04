/**
 * D2C Phase 0: preview panel with caching support.
 * States: none, checking, generating, ready, cached, out_of_date, error.
 * Secondary CTA "Generate preview" lives in CharacterBuilder; this panel displays state only.
 */

export type PreviewPanelStatus = 'none' | 'checking' | 'generating' | 'ready' | 'cached' | 'error' | 'out_of_date';

interface PreviewPanelProps {
  status: PreviewPanelStatus;
  imageUrl?: string;
  errorMessage?: string;
  onRegenerate?: () => void;
  onCancel?: () => void;
}

export function PreviewPanel({
  status,
  imageUrl,
  errorMessage,
  onRegenerate,
  onCancel,
}: PreviewPanelProps) {
  if (status === 'none') {
    return (
      <div className="preview-panel preview-panel--none">
        <p className="preview-panel__placeholder">Generate preview to see your character.</p>
        <style>{`
          .preview-panel--none { padding: var(--spacing-lg, 2rem); text-align: center; background: var(--color-warm-sand, #F1FAEE); border-radius: 12px; }
          .preview-panel__placeholder { font-family: var(--font-body); font-size: 0.9375rem; color: var(--color-soft-charcoal, #333); margin: 0; }
        `}</style>
      </div>
    );
  }

  if (status === 'checking') {
    return (
      <div className="preview-panel preview-panel--checking">
        <div className="preview-panel__spinner preview-panel__spinner--small" aria-hidden />
        <p className="preview-panel__copy">Checking for existing preview…</p>
        <style>{`
          .preview-panel--checking { padding: var(--spacing-md, 1rem); text-align: center; background: var(--color-warm-sand, #F1FAEE); border-radius: 12px; }
          .preview-panel__spinner--small { width: 24px; height: 24px; margin: 0 auto var(--spacing-sm, 0.5rem); border: 2px solid rgba(45,49,66,0.1); border-top-color: var(--color-teal, #5AC6B1); border-radius: 50%; animation: preview-spin 0.8s linear infinite; }
          @keyframes preview-spin { to { transform: rotate(360deg); } }
          @media (prefers-reduced-motion: reduce) { .preview-panel__spinner--small { animation: none; opacity: 0.7; } }
          .preview-panel__copy { font-family: var(--font-body); font-size: 0.875rem; color: var(--color-soft-charcoal, #333); margin: 0; }
        `}</style>
      </div>
    );
  }

  if (status === 'generating') {
    return (
      <div className="preview-panel preview-panel--generating">
        <div className="preview-panel__spinner" aria-hidden />
        <p className="preview-panel__copy">Creating your character… this usually takes under a minute.</p>
        {onCancel && (
          <button type="button" className="preview-panel__cancel" onClick={onCancel}>
            Cancel
          </button>
        )}
        <style>{`
          .preview-panel--generating { padding: var(--spacing-lg, 2rem); text-align: center; background: var(--color-warm-sand, #F1FAEE); border-radius: 12px; }
          .preview-panel__spinner { width: 40px; height: 40px; margin: 0 auto var(--spacing-md, 1rem); border: 3px solid rgba(45,49,66,0.1); border-top-color: var(--color-teal, #5AC6B1); border-radius: 50%; animation: preview-spin 0.8s linear infinite; }
          @keyframes preview-spin { to { transform: rotate(360deg); } }
          @media (prefers-reduced-motion: reduce) { .preview-panel__spinner { animation: none; opacity: 0.7; } }
          .preview-panel__copy { font-family: var(--font-body); font-size: 0.9375rem; color: var(--color-soft-charcoal, #333); margin: 0 0 var(--spacing-sm, 0.5rem); }
          .preview-panel__cancel { font-family: var(--font-ui); font-size: 0.875rem; color: var(--color-teal, #5AC6B1); background: none; border: none; cursor: pointer; text-decoration: underline; }
        `}</style>
      </div>
    );
  }

  // Real image = full URL or same-origin path (e.g. /api/assets/previews/xxx.png); otherwise show placeholder
  const isRealImageUrl = imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('/'));
  
  // 'ready' and 'cached' both display the image
  if (status === 'ready' || status === 'cached') {
    return (
      <div className="preview-panel preview-panel--ready">
        {isRealImageUrl ? (
          <img
            src={imageUrl}
            alt="Character preview"
            className="preview-panel__img"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('preview-panel__placeholder--hidden');
            }}
          />
        ) : null}
        {/* Inline SVG placeholder: visible when no real image or image fails to load */}
        <svg
          className={`preview-panel__placeholder-svg ${isRealImageUrl ? 'preview-panel__placeholder--hidden' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          width="200"
          height="200"
          viewBox="0 0 200 200"
          aria-hidden
        >
          <rect fill="#f1faee" width="200" height="200" />
          <text x="100" y="105" fontFamily="sans-serif" fontSize="14" fill="#666" textAnchor="middle">
            Loading preview…
          </text>
        </svg>
        <style>{`
          .preview-panel--ready { width: fit-content; max-width: 100%; padding: 0; background: var(--color-off-white, #FFFCF8); border-radius: 12px; border: 1px solid rgba(45,49,66,0.08); margin: 0 auto; overflow: hidden; position: relative; }
          .preview-panel__img { display: block; width: auto; height: auto; max-width: 480px; max-height: 560px; border-radius: 12px; object-fit: contain; vertical-align: bottom; }
          .preview-panel__placeholder-svg { display: block; width: auto; max-width: 480px; height: auto; border-radius: 12px; background: #f1faee; }
          .preview-panel__placeholder--hidden { position: absolute; width: 0; height: 0; overflow: hidden; opacity: 0; pointer-events: none; }
        `}</style>
      </div>
    );
  }

  if (status === 'out_of_date') {
    return (
      <div className="preview-panel preview-panel--out-of-date">
        <p className="preview-panel__badge">Preview out of date — regenerate to update.</p>
        {onRegenerate && (
          <button type="button" className="preview-panel__regenerate btn btn-secondary btn-sm" onClick={onRegenerate}>
            Regenerate preview
          </button>
        )}
        <style>{`
          .preview-panel--out-of-date { padding: var(--spacing-md, 1rem); background: #fff8e6; border-radius: 12px; border: 1px solid rgba(249,187,58,0.4); }
          .preview-panel__badge { font-family: var(--font-ui); font-size: 0.875rem; color: var(--color-soft-charcoal, #333); margin: 0 0 var(--spacing-sm, 0.5rem); }
          .preview-panel__regenerate { margin-top: var(--spacing-xs, 0.25rem); }
          .btn { display: inline-block; padding: 0.5rem 1rem; border-radius: 8px; font-family: var(--font-ui); font-size: 0.875rem; font-weight: 600; cursor: pointer; border: none; }
          .btn-secondary { background: var(--color-teal, #5AC6B1); color: #fff; }
          .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8125rem; }
        `}</style>
      </div>
    );
  }

  // error
  return (
    <div className="preview-panel preview-panel--error">
      <p className="preview-panel__error-msg">
        {errorMessage ?? "Preview couldn't be generated right now. You can continue and we'll finish it after checkout."}
      </p>
      {onRegenerate && (
        <button type="button" className="preview-panel__retry btn btn-secondary btn-sm" onClick={onRegenerate}>
          Try again
        </button>
      )}
      <style>{`
        .preview-panel--error { padding: var(--spacing-md, 1rem); background: #ffebee; border-radius: 12px; border: 1px solid rgba(244,67,54,0.3); }
        .preview-panel__error-msg { font-family: var(--font-body); font-size: 0.875rem; color: var(--color-soft-charcoal, #333); margin: 0 0 var(--spacing-sm, 0.5rem); }
        .preview-panel__retry { margin-top: var(--spacing-xs, 0.25rem); }
        .btn { display: inline-block; padding: 0.5rem 1rem; border-radius: 8px; font-family: var(--font-ui); font-size: 0.875rem; font-weight: 600; cursor: pointer; border: none; }
        .btn-secondary { background: var(--color-teal, #5AC6B1); color: #fff; }
        .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8125rem; }
      `}</style>
    </div>
  );
}
