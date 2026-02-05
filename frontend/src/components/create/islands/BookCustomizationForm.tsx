/**
 * D2C Phase 0: Book customization form (dedication page).
 * Loads/saves dedication to sessionStorage; Continue → /create/checkout.
 */

import { useEffect, useState, useCallback } from 'react';
import { load, save } from '../../../lib/createFlow/createFlowStorage';
import { getDefaultState } from '../../../lib/createFlow/createFlowSchema';
import type { CreateFlowState } from '../../../lib/createFlow/createFlowSchema';
import { isCharacterStepComplete } from '../../../lib/createFlow/createFlowSelectors';

const DEDICATION_MAX_LENGTH = 200;

function BookCustomizationForm() {
  const [state, setState] = useState<CreateFlowState | null>(null);

  // Load state on mount; redirect if character step incomplete
  useEffect(() => {
    const loaded = load();
    if (!loaded || !isCharacterStepComplete(loaded)) {
      window.location.href = '/create/character?toast=missing_state';
      return;
    }
    setState(loaded);
  }, []);

  const persist = useCallback((partial: Partial<CreateFlowState>) => {
    save(partial);
    setState((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        ...partial,
        book: { ...prev.book, ...(partial.book ?? {}) },
      };
    });
  }, []);

  const handleDedicationChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value.slice(0, DEDICATION_MAX_LENGTH);
      persist({ book: { dedication: value } });
    },
    [persist]
  );

  const handleContinue = useCallback(() => {
    window.location.href = '/create/checkout';
  }, []);

  const handleBack = useCallback(() => {
    window.location.href = '/create/character';
  }, []);

  if (!state) {
    return <p className="create-loading">Loading…</p>;
  }

  const dedication = state.book?.dedication ?? '';
  const charCount = dedication.length;
  const charName = state.character?.name || 'Your character';

  return (
    <div className="book-customization">
      <h1 className="book-customization__title">Customize your book</h1>

      {/* Character summary card */}
      <section className="book-customization__summary">
        <h2 className="book-customization__summary-title">Your character</h2>
        <div className="book-customization__summary-content">
          <div className="book-customization__summary-text">
            <p className="book-customization__summary-name">{charName}</p>
            <p className="book-customization__summary-details">
              {state.character?.age && `Age ${state.character.age}`}
              {state.character?.pronouns && ` · ${formatPronouns(state.character.pronouns)}`}
            </p>
            {state.character?.favoriteAnimal && (
              <p className="book-customization__summary-animal">
                Animal guide: {formatAnimalName(state.character.favoriteAnimal)}
              </p>
            )}
          </div>
          {/* Only show images section if preview exists; otherwise text info is sufficient */}
          {state.preview?.imageUrl && (
            <div className="book-customization__summary-images">
              <img
                src={state.preview.imageUrl}
                alt={`${charName} preview`}
                className="book-customization__summary-preview"
              />
              {state.character?.favoriteAnimal && (
                <img
                  src={`/animals/${state.character.favoriteAnimal}.png`}
                  alt={`${formatAnimalName(state.character.favoriteAnimal)} guide`}
                  className={`book-customization__summary-animal-img${state.character.favoriteAnimal === 'dog' || state.character.favoriteAnimal === 'penguin' ? ' book-customization__summary-animal-img--flip' : ''}`}
                />
              )}
            </div>
          )}
        </div>
      </section>

      {/* Dedication section */}
      <section className="book-customization__section">
        <h2 className="book-customization__section-title">Add a dedication</h2>
        <p className="book-customization__section-desc">
          Write a personal message that will appear on the first page of the book. This is optional.
        </p>
        <div className="book-customization__field">
          <label className="book-customization__label" htmlFor="dedication">
            Dedication message
          </label>
          <textarea
            id="dedication"
            className="book-customization__textarea"
            value={dedication}
            onChange={handleDedicationChange}
            placeholder={`For ${charName}, with all my love…`}
            maxLength={DEDICATION_MAX_LENGTH}
            rows={4}
          />
          <span className="book-customization__char-count">
            {charCount}/{DEDICATION_MAX_LENGTH}
          </span>
        </div>
      </section>

      {/* CTAs */}
      <div className="book-customization__ctas">
        <button
          type="button"
          className="book-customization__btn book-customization__btn--secondary"
          onClick={handleBack}
        >
          Back
        </button>
        <button
          type="button"
          className="book-customization__btn book-customization__btn--primary"
          onClick={handleContinue}
        >
          Continue to checkout
        </button>
      </div>

      <style>{`
        .book-customization { max-width: 640px; margin: 0 auto; }
        .create-loading { font-family: var(--font-body); color: var(--color-soft-charcoal); padding: var(--spacing-md); }
        
        .book-customization__title { 
          font-family: var(--font-heading); 
          font-size: 1.75rem; 
          font-weight: 700; 
          color: var(--color-navy-midnight); 
          margin-bottom: var(--spacing-lg); 
        }
        
        /* Character summary card */
        .book-customization__summary {
          background: var(--color-warm-sand, #F1FAEE);
          border-radius: 12px;
          padding: var(--spacing-md);
          margin-bottom: var(--spacing-xl);
        }
        .book-customization__summary-title {
          font-family: var(--font-ui);
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-soft-charcoal);
          margin: 0 0 var(--spacing-sm);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .book-customization__summary-content {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: var(--spacing-md);
        }
        .book-customization__summary-text {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-xs);
          flex: 1;
        }
        .book-customization__summary-name {
          font-family: var(--font-heading);
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--color-navy-midnight);
          margin: 0;
        }
        .book-customization__summary-details {
          font-family: var(--font-body);
          font-size: 0.9375rem;
          color: var(--color-soft-charcoal);
          margin: 0;
        }
        .book-customization__summary-animal {
          font-family: var(--font-body);
          font-size: 0.9375rem;
          color: var(--color-soft-charcoal);
          margin: 0;
        }
        .book-customization__summary-images {
          display: flex;
          gap: 0;
          align-items: flex-end;
          background: #fff;
          border-radius: 12px;
          padding: var(--spacing-sm);
        }
        .book-customization__summary-preview {
          width: 130px;
          height: 130px;
          object-fit: contain;
        }
        .book-customization__summary-animal-img {
          width: 83px;
          height: 83px;
          object-fit: contain;
          margin-left: -40px;
        }
        .book-customization__summary-animal-img--flip {
          transform: scaleX(-1);
        }
        
        /* Dedication section */
        .book-customization__section {
          margin-bottom: var(--spacing-xl);
        }
        .book-customization__section-title {
          font-family: var(--font-ui);
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--color-navy-midnight);
          margin-bottom: var(--spacing-sm);
        }
        .book-customization__section-desc {
          font-family: var(--font-body);
          font-size: 0.9375rem;
          color: var(--color-soft-charcoal);
          margin: 0 0 var(--spacing-md);
        }
        
        .book-customization__field {
          position: relative;
        }
        .book-customization__label {
          display: block;
          font-family: var(--font-ui);
          font-size: 0.9375rem;
          font-weight: 500;
          color: var(--color-soft-charcoal);
          margin-bottom: 0.5rem;
        }
        .book-customization__textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid rgba(45,49,66,0.25);
          border-radius: 8px;
          font-family: var(--font-body);
          font-size: 1rem;
          line-height: 1.5;
          resize: vertical;
          min-height: 100px;
        }
        .book-customization__textarea:focus {
          outline: 2px solid var(--color-teal);
          outline-offset: 2px;
        }
        .book-customization__char-count {
          position: absolute;
          bottom: 0.5rem;
          right: 0.75rem;
          font-family: var(--font-ui);
          font-size: 0.75rem;
          color: var(--color-soft-charcoal);
          opacity: 0.7;
        }
        
        /* CTAs */
        .book-customization__ctas {
          display: flex;
          flex-wrap: wrap;
          gap: var(--spacing-md);
          margin-top: var(--spacing-xl);
        }
        .book-customization__btn {
          padding: 0.75rem 2rem;
          border-radius: 12px;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          border: none;
        }
        .book-customization__btn--primary {
          background: var(--color-hero-coral);
          color: #fff;
        }
        .book-customization__btn--secondary {
          background: transparent;
          color: var(--color-soft-charcoal);
          border: 1px solid rgba(45,49,66,0.25);
        }
        .book-customization__btn--secondary:hover {
          background: rgba(45,49,66,0.05);
        }
      `}</style>
    </div>
  );
}

/** Format pronouns for display (e.g., "she-her" → "She/Her") */
function formatPronouns(pronouns: string): string {
  const map: Record<string, string> = {
    'she-her': 'She/Her',
    'he-him': 'He/Him',
    'they-them': 'They/Them',
  };
  return map[pronouns] ?? pronouns;
}

/** Format animal name for display (e.g., "t-rex" → "T-Rex") */
function formatAnimalName(animal: string): string {
  const map: Record<string, string> = {
    'dog': 'Dog',
    'cat': 'Cat',
    'owl': 'Owl',
    'lion': 'Lion',
    'tiger': 'Tiger',
    'penguin': 'Penguin',
    't-rex': 'T-Rex',
    'unicorn': 'Unicorn',
  };
  return map[animal] ?? animal.charAt(0).toUpperCase() + animal.slice(1);
}

export default BookCustomizationForm;
