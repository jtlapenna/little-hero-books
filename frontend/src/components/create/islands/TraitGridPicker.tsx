/**
 * D2C Phase 0: image grid trait picker (hair style, animal guide).
 * A11y: fieldset, tab/Enter/Space, visible focus, reduced-motion.
 */

export interface TraitGridOption {
  id: string;
  label: string;
  imageUrl?: string;
  fallbackImageUrl?: string;
}

interface TraitGridPickerProps {
  options: TraitGridOption[];
  value: string | undefined;
  onChange: (id: string) => void;
  name: string;
  label: string;
}

export function TraitGridPicker({ options, value, onChange, name, label }: TraitGridPickerProps) {
  return (
    <fieldset className="trait-grid-picker" aria-label={`${name}: ${value ? `${value} selected` : 'select one'}`}>
      <legend className="trait-grid-picker__legend">{label}</legend>
      <div className="trait-grid-picker__grid" role="group">
        {options.map((opt) => {
          const selected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={selected}
              aria-label={`${opt.label}${selected ? ', selected' : ''}`}
              title={opt.label}
              className={`trait-grid-picker__option ${selected ? 'trait-grid-picker__option--selected' : ''}`}
              onClick={() => onChange(opt.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange(opt.id);
                }
              }}
            >
              {opt.imageUrl ? (
                <img
                  src={opt.imageUrl}
                  alt=""
                  className="trait-grid-picker__img"
                  loading="lazy"
                  onError={(e) => {
                    const el = e.target as HTMLImageElement;
                    if (opt.fallbackImageUrl) el.src = opt.fallbackImageUrl;
                    else el.style.display = 'none';
                  }}
                />
              ) : (
                <span className="trait-grid-picker__placeholder" aria-hidden />
              )}
              <span className="trait-grid-picker__label">{opt.label}</span>
              {selected && (
                <span className="trait-grid-picker__check" aria-hidden>
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
      <style>{`
        .trait-grid-picker { border: none; margin: 0 0 var(--spacing-md, 1rem); padding: 0; }
        .trait-grid-picker__legend { font-family: var(--font-ui); font-size: 0.9375rem; font-weight: 600; color: var(--color-navy-midnight, #2D3142); margin-bottom: var(--spacing-sm, 0.5rem); }
        .trait-grid-picker__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-sm, 0.5rem); }
        @media (min-width: 640px) { .trait-grid-picker__grid { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 768px) { .trait-grid-picker__grid { grid-template-columns: repeat(4, 1fr); } }
        .trait-grid-picker__option { position: relative; display: flex; flex-direction: column; align-items: center; padding: var(--spacing-md, 1rem); border: 2px solid rgba(45,49,66,0.15); border-radius: 14px; background: #fff; cursor: pointer; min-height: 178px; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
        .trait-grid-picker__option:hover { border-color: var(--color-teal, #5AC6B1); }
        .trait-grid-picker__option:focus { outline: 2px solid var(--color-teal, #5AC6B1); outline-offset: 2px; }
        .trait-grid-picker__option--selected { border-color: var(--color-teal, #5AC6B1); box-shadow: 0 0 0 2px var(--color-teal, #5AC6B1); }
        @media (prefers-reduced-motion: reduce) { .trait-grid-picker__option { transition: none; } }
        .trait-grid-picker__img { width: 110px; height: 110px; object-fit: contain; margin-bottom: 8px; }
        .trait-grid-picker__placeholder { width: 110px; height: 110px; background: var(--color-soft-charcoal, #333); opacity: 0.2; border-radius: 10px; margin-bottom: 8px; }
        .trait-grid-picker__label { font-family: var(--font-ui); font-size: 0.9375rem; text-align: center; color: var(--color-soft-charcoal, #333); }
        .trait-grid-picker__check { position: absolute; top: 10px; right: 10px; width: 36px; height: 36px; background: var(--color-teal, #5AC6B1); color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.125rem; font-weight: 700; }
      `}</style>
    </fieldset>
  );
}
