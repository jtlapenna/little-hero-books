/**
 * D2C Phase 0: color swatch trait picker (skin tone, hair color, favorite color).
 * A11y: fieldset, tab/Enter/Space, visible focus, reduced-motion.
 */

export interface SwatchOption {
  id: string;
  label: string;
  hex?: string;
}

interface SwatchPickerProps {
  options: SwatchOption[];
  value: string | undefined;
  onChange: (id: string) => void;
  name: string;
  label: string;
}

export function SwatchPicker({ options, value, onChange, name, label }: SwatchPickerProps) {
  return (
    <fieldset className="swatch-picker" aria-label={`${name}: ${value ? `${value} selected` : 'select one'}`}>
      <legend className="swatch-picker__legend">{label}</legend>
      <div className="swatch-picker__row" role="group">
        {options.map((opt) => {
          const selected = value === opt.id;
          return (
            <div key={opt.id} className="swatch-picker__cell">
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`${opt.label}${selected ? ', selected' : ''}`}
                title={opt.label}
                className={`swatch-picker__option ${selected ? 'swatch-picker__option--selected' : ''}`}
                style={opt.hex ? { backgroundColor: opt.hex } : undefined}
                onClick={() => onChange(opt.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onChange(opt.id);
                  }
                }}
              >
                {selected && (
                  <span className="swatch-picker__check" aria-hidden>
                    ✓
                  </span>
                )}
              </button>
              <span className="swatch-picker__label">{opt.label}</span>
            </div>
          );
        })}
      </div>
      <style>{`
        .swatch-picker { border: none; margin: 0 0 var(--spacing-md, 1rem); padding: 0; }
        .swatch-picker__legend { font-family: var(--font-ui); font-size: 0.9375rem; font-weight: 600; color: var(--color-navy-midnight, #2D3142); margin-bottom: var(--spacing-sm, 0.5rem); }
        .swatch-picker__row { display: flex; flex-wrap: wrap; gap: var(--spacing-md, 1rem); }
        .swatch-picker__cell { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .swatch-picker__option { position: relative; width: 48px; height: 48px; border: 2px solid rgba(45,49,66,0.2); border-radius: 50%; cursor: pointer; flex-shrink: 0; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
        .swatch-picker__option:hover { border-color: var(--color-teal, #5AC6B1); }
        .swatch-picker__option:focus { outline: 2px solid var(--color-teal, #5AC6B1); outline-offset: 2px; }
        .swatch-picker__option--selected { border-color: var(--color-navy-midnight, #2D3142); box-shadow: 0 0 0 2px var(--color-teal, #5AC6B1); }
        @media (prefers-reduced-motion: reduce) { .swatch-picker__option { transition: none; } }
        .swatch-picker__check { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1rem; font-weight: 700; text-shadow: 0 0 2px rgba(0,0,0,0.8); }
        .swatch-picker__label { font-family: var(--font-ui); font-size: 0.6875rem; color: var(--color-soft-charcoal, #333); text-align: center; max-width: 52px; }
      `}</style>
    </fieldset>
  );
}
