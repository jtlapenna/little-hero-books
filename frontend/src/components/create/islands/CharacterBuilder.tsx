/**
 * D2C Phase 0: character step form. Loads/saves state via createFlowStorage;
 * trait pickers, optional details, preview stub, Continue → /create/customize.
 */

import { useEffect, useState, useCallback } from 'react';
import { load, save } from '../../../lib/createFlow/createFlowStorage';
import { getDefaultState } from '../../../lib/createFlow/createFlowSchema';
import type { CreateFlowState, CreateFlowCharacter } from '../../../lib/createFlow/createFlowSchema';
import { isCharacterStepComplete } from '../../../lib/createFlow/createFlowSelectors';
import {
  getHairStyleOptionsForColor,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  FAVORITE_COLORS,
  ANIMAL_GUIDES,
  PRONOUNS,
  HOMETOWN_DEFAULT,
  NAME_MAX_LENGTH,
  AGE_MIN,
  AGE_MAX,
} from '../../../lib/createFlow/traitOptions';
import { TraitGridPicker } from './TraitGridPicker';
import { SwatchPicker } from './SwatchPicker';
import { PreviewPanel, type PreviewPanelStatus } from './PreviewPanel';

const PREVIEW_CAP = 3;
const PREVIEW_TIMEOUT_MS = 90000;

/** Backend base URL for API calls (empty = same origin). Set PUBLIC_BACKEND_URL in dev if frontend/backend differ. */
const API_BASE = (import.meta as { env?: { PUBLIC_BACKEND_URL?: string } }).env?.PUBLIC_BACKEND_URL ?? '';

/**
 * Request character preview from backend (POST /api/preview/generate). Uses Gemini server-side.
 */
function requestPreview(character: CreateFlowCharacter): Promise<{ imageUrl?: string; error?: string }> {
  const url = `${API_BASE}/api/preview/generate`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ character_specs: character }),
    signal: controller.signal,
  })
    .then(async (res) => {
      clearTimeout(timeoutId);
      const contentType = res.headers.get('content-type') ?? '';
      const text = await res.text();
      // Backend returns JSON; HTML usually means wrong origin (e.g. 404 from frontend)
      if (!contentType.includes('application/json') || !text.trim().startsWith('{')) {
        const hint = API_BASE ? '' : ' Set PUBLIC_BACKEND_URL in frontend/.env (e.g. http://localhost:3000) if the backend runs on a different port.';
        return { ok: false, error: `Preview service returned an unexpected response (${res.status}). Is the backend running?${hint}` };
      }
      const data = JSON.parse(text) as { imageUrl?: string; image_url?: string; error?: string };
      return { ok: res.ok, imageUrl: data.imageUrl ?? data.image_url, error: data.error };
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return { ok: false, error: 'Preview timed out. You can continue and we\'ll finish it after checkout.' };
      }
      return { ok: false, error: err?.message ?? 'Preview couldn\'t be generated right now. You can continue and we\'ll finish it after checkout.' };
    })
    .then((out) => (out.ok ? { imageUrl: out.imageUrl } : { error: out.error }));
}

/** Name: 1–20 chars, letters/spaces/hyphens */
function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Please enter your child\'s name.';
  if (trimmed.length > NAME_MAX_LENGTH) return `Name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  if (!/^[a-zA-Z\s\-]+$/.test(trimmed)) return 'Name can only include letters, spaces, and hyphens.';
  return null;
}

function CharacterBuilder() {
  const [state, setState] = useState<CreateFlowState | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [previewTimeoutId, setPreviewTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Load state on mount; sanitize so we don't show stub and cap doesn't block after bad/stale state
  useEffect(() => {
    let initial = load() ?? getDefaultState();
    const prev = initial.preview;
    const hasValidImageUrl = prev?.imageUrl && (prev.imageUrl.startsWith('http://') || prev.imageUrl.startsWith('https://') || prev.imageUrl.startsWith('/'));
    const readyNoImage = prev?.status === 'ready' && !hasValidImageUrl;
    const noneOrErrorWithCap = (prev?.status === 'none' || prev?.status === 'error') && (prev?.generationCount ?? 0) >= PREVIEW_CAP && !hasValidImageUrl;
    if (readyNoImage || noneOrErrorWithCap) {
      const sanitized = { ...initial, preview: { status: 'none' as const, generationCount: 0 } };
      save({ preview: sanitized.preview });
      initial = sanitized;
    }
    setState(initial);
  }, []);

  const persist = useCallback((partial: Partial<CreateFlowState>) => {
    save(partial);
    setState((prev) => {
      if (!prev) return null;
      const next = { ...prev };
      if (partial.character) next.character = { ...prev.character, ...partial.character };
      if (partial.preview !== undefined) next.preview = partial.preview;
      return next;
    });
  }, []);

  const updateCharacter = useCallback(
    (updates: Partial<CreateFlowCharacter>) => {
      if (!state) return;
      const nextChar = { ...state.character, ...updates };
      persist({ character: nextChar });
      // If a required trait changed and preview was ready, mark out_of_date
      const requiredKeys = ['name', 'age', 'pronouns', 'skinTone', 'hairStyle', 'hairColor', 'favoriteColor', 'favoriteAnimal'];
      const changedRequired = requiredKeys.some((k) => updates[k as keyof CreateFlowCharacter] !== undefined);
      if (changedRequired && state.preview?.status === 'ready') {
        persist({ preview: { ...state.preview, status: 'out_of_date' } });
      }
    },
    [state, persist]
  );

  const handleContinue = useCallback(() => {
    if (!state || !isCharacterStepComplete(state)) return;
    window.location.href = '/create/customize';
  }, [state]);

  const handleGeneratePreview = useCallback(() => {
    if (!state) return;
    const count = state.preview?.generationCount ?? 0;
    const isOutOfDate = state.preview?.status === 'out_of_date';
    if (count >= PREVIEW_CAP && !isOutOfDate) return;
    persist({
      preview: {
        status: 'generating',
        generationCount: count + 1,
      },
    });
    const timeoutId = setTimeout(() => {
      persist({
        preview: {
          status: 'error',
          errorMessage: 'Preview timed out. You can continue and we\'ll finish it after checkout.',
          generationCount: count + 1,
        },
      });
      setPreviewTimeoutId(null);
    }, PREVIEW_TIMEOUT_MS);
    setPreviewTimeoutId(timeoutId);
    requestPreview(state.character).then((result) => {
      if (timeoutId) clearTimeout(timeoutId);
      setPreviewTimeoutId(null);
      if (result.imageUrl) {
        // When backend is on another origin, prepend API_BASE so img loads from backend
        const imageUrl = result.imageUrl.startsWith('http') ? result.imageUrl : `${API_BASE}${result.imageUrl}`;
        persist({
          preview: {
            status: 'ready',
            imageUrl,
            generatedAt: new Date().toISOString(),
            generationCount: count + 1,
          },
        });
      } else {
        persist({
          preview: {
            status: 'error',
            errorMessage: result.error ?? 'Preview couldn\'t be generated right now. You can continue and we\'ll finish it after checkout.',
            generationCount: count + 1,
          },
        });
      }
    });
  }, [state, persist]);

  const handleCancelPreview = useCallback(() => {
    if (previewTimeoutId) clearTimeout(previewTimeoutId);
    setPreviewTimeoutId(null);
    persist({ preview: { status: 'none', generationCount: state?.preview?.generationCount ?? 0 } });
  }, [previewTimeoutId, state?.preview?.generationCount, persist]);

  useEffect(() => () => { if (previewTimeoutId) clearTimeout(previewTimeoutId); }, [previewTimeoutId]);

  if (!state) return <p className="create-loading">Loading…</p>;

  const char = state.character;
  const previewStatus: PreviewPanelStatus = state.preview?.status ?? 'none';
  const canContinue = isCharacterStepComplete(state);
  const previewCount = state.preview?.generationCount ?? 0;
  const canPreview = canContinue && (previewCount < PREVIEW_CAP || previewStatus === 'out_of_date');

  const onNameBlur = () => setNameError(validateName(char.name ?? ''));
  const onAgeBlur = () => {
    const a = char.age;
    if (a === undefined || a === null) setAgeError('Please select an age.');
    else if (Number(a) < AGE_MIN || Number(a) > AGE_MAX) setAgeError(`Age must be between ${AGE_MIN} and ${AGE_MAX}.`);
    else setAgeError(null);
  };

  return (
    <div className="character-builder">
      <h1 className="character-builder__title">Create your character</h1>

      {/* About your child */}
      <section className="character-builder__section">
        <h2 className="character-builder__section-title">About your child</h2>
        <div className="character-builder__row">
          <label className="character-builder__label">
            Child&apos;s name
            <input
              type="text"
              className="character-builder__input"
              value={char.name ?? ''}
              onChange={(e) => updateCharacter({ name: e.target.value.slice(0, NAME_MAX_LENGTH) })}
              onBlur={onNameBlur}
              placeholder="e.g. Sam"
              maxLength={NAME_MAX_LENGTH}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'name-error' : undefined}
            />
            {nameError && <span id="name-error" className="character-builder__error" role="alert">{nameError}</span>}
          </label>
          <label className="character-builder__label">
            Age (3–8)
            <input
              type="number"
              min={AGE_MIN}
              max={AGE_MAX}
              className="character-builder__input character-builder__input--age"
              value={char.age ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? undefined : Number(e.target.value);
                updateCharacter({ age: v });
              }}
              onBlur={onAgeBlur}
              placeholder="3–8"
              aria-invalid={!!ageError}
              aria-describedby={ageError ? 'age-error' : undefined}
            />
            {ageError && <span id="age-error" className="character-builder__error" role="alert">{ageError}</span>}
          </label>
        </div>
        <label className="character-builder__label">
          Pronouns
          <select
            className="character-builder__select"
            value={char.pronouns ?? 'they-them'}
            onChange={(e) => updateCharacter({ pronouns: e.target.value })}
          >
            {PRONOUNS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="character-builder__label">
          Hometown (optional)
          <input
            type="text"
            className="character-builder__input"
            value={char.hometown ?? HOMETOWN_DEFAULT}
            onChange={(e) => updateCharacter({ hometown: e.target.value || HOMETOWN_DEFAULT })}
            placeholder={HOMETOWN_DEFAULT}
          />
        </label>
      </section>

      {/* Look & style */}
      <section className="character-builder__section">
        <h2 className="character-builder__section-title">Look & style</h2>
        <SwatchPicker
          options={SKIN_TONES}
          value={char.skinTone}
          onChange={(id) => updateCharacter({ skinTone: id })}
          name="Skin tone"
          label="Skin tone"
        />
        <SwatchPicker
          options={HAIR_COLORS}
          value={char.hairColor}
          onChange={(id) => updateCharacter({ hairColor: id })}
          name="Hair color"
          label="Hair color"
        />
        <TraitGridPicker
          options={char.hairColor ? getHairStyleOptionsForColor(char.hairColor) : HAIR_STYLES}
          value={char.hairStyle}
          onChange={(id) => updateCharacter({ hairStyle: id })}
          name="Hair style"
          label="Hair style"
        />
      </section>

      {/* Favorites */}
      <section className="character-builder__section">
        <h2 className="character-builder__section-title">Favorites</h2>
        <SwatchPicker
          options={FAVORITE_COLORS}
          value={char.favoriteColor}
          onChange={(id) => updateCharacter({ favoriteColor: id })}
          name="Favorite color"
          label="Favorite color"
        />
        <TraitGridPicker
          options={ANIMAL_GUIDES}
          value={char.favoriteAnimal}
          onChange={(id) => updateCharacter({ favoriteAnimal: id })}
          name="Animal guide"
          label="Animal guide"
        />
      </section>

      {/* Preview panel (stub) */}
      <section className="character-builder__section character-builder__preview-section">
        <PreviewPanel
          status={previewStatus}
          imageUrl={state.preview?.imageUrl}
          errorMessage={state.preview?.errorMessage}
          onRegenerate={canPreview ? handleGeneratePreview : undefined}
          onCancel={previewStatus === 'generating' ? handleCancelPreview : undefined}
        />
        {previewStatus === 'none' && (
          <p className="character-builder__preview-helper">You can continue without a preview.</p>
        )}
      </section>

      {/* CTAs */}
      <div className="character-builder__ctas">
        <button
          type="button"
          className="character-builder__btn character-builder__btn--secondary"
          onClick={handleGeneratePreview}
          disabled={!canPreview}
        >
          Generate preview (~45s)
        </button>
        <button
          type="button"
          className="character-builder__btn character-builder__btn--primary"
          onClick={handleContinue}
          disabled={!canContinue}
        >
          Continue
        </button>
      </div>

      <style>{`
        .character-builder { max-width: 640px; }
        .create-loading { font-family: var(--font-body); color: var(--color-soft-charcoal); padding: var(--spacing-md); }
        .character-builder__title { font-family: var(--font-heading); font-size: 1.75rem; font-weight: 700; color: var(--color-navy-midnight); margin-bottom: var(--spacing-lg); }
        .character-builder__section { margin-bottom: var(--spacing-lg); }
        .character-builder__section-title { font-family: var(--font-ui); font-size: 1.125rem; font-weight: 600; color: var(--color-navy-midnight); margin-bottom: var(--spacing-md); }
        .character-builder__row { display: flex; flex-wrap: wrap; gap: var(--spacing-md); }
        .character-builder__label { display: block; font-family: var(--font-ui); font-size: 0.9375rem; font-weight: 500; color: var(--color-soft-charcoal); margin-bottom: var(--spacing-sm); }
        .character-builder__input { width: 100%; max-width: 240px; padding: 0.5rem 0.75rem; border: 1px solid rgba(45,49,66,0.2); border-radius: 8px; font-family: var(--font-body); font-size: 1rem; }
        .character-builder__input--age { max-width: 80px; }
        .character-builder__input:focus { outline: 2px solid var(--color-teal); outline-offset: 2px; }
        .character-builder__error { display: block; font-size: 0.875rem; color: var(--color-hero-coral); margin-top: 2px; }
        .character-builder__select { padding: 0.5rem 0.75rem; border: 1px solid rgba(45,49,66,0.2); border-radius: 8px; font-family: var(--font-body); font-size: 1rem; max-width: 200px; }
        .character-builder__preview-section { margin-top: var(--spacing-xl); }
        .character-builder__preview-helper { font-size: 0.875rem; color: var(--color-soft-charcoal); margin-top: var(--spacing-sm); }
        .character-builder__ctas { display: flex; flex-wrap: wrap; gap: var(--spacing-md); margin-top: var(--spacing-xl); }
        .character-builder__btn { padding: 0.75rem 2rem; border-radius: 12px; font-family: var(--font-display); font-weight: 700; font-size: 1rem; cursor: pointer; border: none; }
        .character-builder__btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .character-builder__btn--primary { background: var(--color-hero-coral); color: #fff; }
        .character-builder__btn--secondary { background: var(--color-teal); color: #fff; }
      `}</style>
    </div>
  );
}

export default CharacterBuilder;
