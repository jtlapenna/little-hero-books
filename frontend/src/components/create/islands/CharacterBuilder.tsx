/**
 * D2C Phase 0: character step form. Loads/saves state via createFlowStorage;
 * trait pickers, optional details, preview with caching, Continue → /create/customize.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { load, save } from '../../../lib/createFlow/createFlowStorage';
import { getDefaultState } from '../../../lib/createFlow/createFlowSchema';
import type { CreateFlowState, CreateFlowCharacter } from '../../../lib/createFlow/createFlowSchema';
import { isCharacterStepComplete } from '../../../lib/createFlow/createFlowSelectors';
import {
  getHairStyleOptionsForColor,
  HAIR_COLORS,
  SKIN_TONES,
  FAVORITE_COLORS,
  ANIMAL_GUIDES,
  PRONOUNS,
  HOMETOWN_DEFAULT,
  NAME_MAX_LENGTH,
} from '../../../lib/createFlow/traitOptions';
import { hasRequiredVisualTraits, computeVisualTraitsKey } from '../../../lib/createFlow/characterHash';
import { TraitGridPicker } from './TraitGridPicker';
import { SwatchPicker } from './SwatchPicker';
import { PreviewPanel, type PreviewPanelStatus } from './PreviewPanel';

const PREVIEW_CAP = 3;
const PREVIEW_TIMEOUT_MS = 90000;
/** Timeout for cache-check request so we don't hang if backend is unreachable */
const PREVIEW_CHECK_TIMEOUT_MS = 10000;

/** Backend base URL for API calls (empty = same origin). Set PUBLIC_BACKEND_URL in dev if frontend/backend differ. */
const API_BASE =
  (import.meta as { env?: { PUBLIC_API_URL?: string; PUBLIC_BACKEND_URL?: string; PROD?: boolean } }).env?.PUBLIC_API_URL ??
  (import.meta as { env?: { PUBLIC_API_URL?: string; PUBLIC_BACKEND_URL?: string; PROD?: boolean } }).env?.PUBLIC_BACKEND_URL ??
  ((import.meta as { env?: { PROD?: boolean } }).env?.PROD ? 'https://admin.littleherolabs.com' : '');

interface PreviewResult {
  imageUrl?: string;
  hash?: string;
  cached?: boolean;
  error?: string;
}

/**
 * Fast cache check - only checks if cached preview exists (HEAD request).
 * Backend computes the hash (ensures algorithm match).
 * Does NOT generate if missing - just returns exists: false.
 */
async function checkPreviewCache(character: CreateFlowCharacter): Promise<{ exists: boolean; imageUrl?: string; hash?: string }> {
  const url = `${API_BASE}/api/preview/check`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PREVIEW_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character_specs: character }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return { exists: false };
    const data = await res.json() as { exists: boolean; imageUrl?: string; hash?: string };
    return data;
  } catch {
    clearTimeout(timeoutId);
    return { exists: false };
  }
}

/**
 * Request character preview from backend (POST /api/preview/generate). Uses Gemini server-side.
 * Now returns hash and cached flag in addition to imageUrl.
 */
function requestPreview(character: CreateFlowCharacter, forceRegenerate = false): Promise<PreviewResult> {
  const url = `${API_BASE}/api/preview/generate`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ character_specs: character, forceRegenerate }),
    signal: controller.signal,
  })
    .then(async (res) => {
      clearTimeout(timeoutId);
      const contentType = res.headers.get('content-type') ?? '';
      const text = await res.text();
      // Backend returns JSON; HTML usually means wrong origin (e.g. 404 from frontend)
      if (!contentType.includes('application/json') || !text.trim().startsWith('{')) {
        const hint = API_BASE
          ? ''
          : ' Set PUBLIC_API_URL (or PUBLIC_BACKEND_URL) in the frontend environment (e.g. https://admin.littleherolabs.com).';
        return { ok: false, error: `Preview service returned an unexpected response (${res.status}). Is the backend running?${hint}` };
      }
      const data = JSON.parse(text) as { imageUrl?: string; image_url?: string; hash?: string; cached?: boolean; error?: string };
      return { ok: res.ok, imageUrl: data.imageUrl ?? data.image_url, hash: data.hash, cached: data.cached, error: data.error };
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return { ok: false, error: 'Preview timed out. You can continue and we\'ll finish it after checkout.' };
      }
      return { ok: false, error: err?.message ?? 'Preview couldn\'t be generated right now. You can continue and we\'ll finish it after checkout.' };
    })
    .then((out) => (out.ok ? { imageUrl: out.imageUrl, hash: out.hash, cached: out.cached } : { error: out.error }));
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
  
  // Track visual traits key to detect changes for cache check
  const lastVisualTraitsKeyRef = useRef<string | null>(null);
  const cacheCheckInProgressRef = useRef(false);

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
      
      // Check if visual traits changed (affects preview caching)
      const visualKeys = ['pronouns', 'skinTone', 'hairStyle', 'hairColor', 'favoriteColor'];
      const changedVisual = visualKeys.some((k) => updates[k as keyof CreateFlowCharacter] !== undefined);
      
      // If a visual trait changed and preview was ready/cached, mark out_of_date
      if (changedVisual && (state.preview?.status === 'ready' || state.preview?.status === 'cached')) {
        persist({ preview: { ...state.preview, status: 'out_of_date' } });
      }
    },
    [state, persist]
  );

  // Auto-check cache when visual traits change and all required traits are present
  useEffect(() => {
    if (!state) return;
    
    // Skip if not all required visual traits are set
    if (!hasRequiredVisualTraits(state.character)) return;
    
    // Compute current visual traits key
    const currentKey = computeVisualTraitsKey(state.character);
    
    // Skip if visual traits haven't changed
    if (currentKey === lastVisualTraitsKeyRef.current) return;
    lastVisualTraitsKeyRef.current = currentKey;
    
    // Skip if already checking or generating
    if (cacheCheckInProgressRef.current) return;
    if (state.preview?.status === 'generating') return;
    
    // Skip if we already have a valid cached/ready preview with matching hash
    // (The hash comparison ensures we re-check if traits changed)
    if ((state.preview?.status === 'cached' || state.preview?.status === 'ready') && state.preview?.imageUrl) {
      return;
    }
    
    // Set checking status and check cache
    cacheCheckInProgressRef.current = true;
    persist({ preview: { status: 'checking', generationCount: state.preview?.generationCount ?? 0 } });
    
    checkPreviewCache(state.character).then((result) => {
      cacheCheckInProgressRef.current = false;
      if (result.exists && result.imageUrl) {
        const imageUrl = result.imageUrl.startsWith('http') ? result.imageUrl : `${API_BASE}${result.imageUrl}`;
        persist({
          preview: {
            status: 'cached',
            imageUrl,
            characterHash: result.hash,
            generatedAt: new Date().toISOString(),
            generationCount: state.preview?.generationCount ?? 0,
          },
        });
      } else {
        persist({ preview: { status: 'none', generationCount: state.preview?.generationCount ?? 0 } });
      }
    }).catch(() => {
      cacheCheckInProgressRef.current = false;
      persist({ preview: { status: 'none', generationCount: state.preview?.generationCount ?? 0 } });
    });
  }, [state?.character.skinTone, state?.character.hairStyle, state?.character.hairColor, state?.character.favoriteColor, state?.character.pronouns, state, persist]);

  const handleContinue = useCallback(() => {
    if (!state || !isCharacterStepComplete(state)) return;
    window.location.href = '/create/customize';
  }, [state]);

  const handleGeneratePreview = useCallback((forceRegenerate = false) => {
    if (!state) return;
    const count = state.preview?.generationCount ?? 0;
    const isOutOfDate = state.preview?.status === 'out_of_date';
    if (count >= PREVIEW_CAP && !isOutOfDate && !forceRegenerate) return;
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
    requestPreview(state.character, forceRegenerate).then((result) => {
      if (timeoutId) clearTimeout(timeoutId);
      setPreviewTimeoutId(null);
      if (result.imageUrl) {
        // When backend is on another origin, prepend API_BASE so img loads from backend
        const imageUrl = result.imageUrl.startsWith('http') ? result.imageUrl : `${API_BASE}${result.imageUrl}`;
        persist({
          preview: {
            status: result.cached ? 'cached' : 'ready',
            imageUrl,
            characterHash: result.hash,
            generatedAt: new Date().toISOString(),
            generationCount: result.cached ? count : count + 1,
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
  // Can generate new preview if: step complete, under cap, not currently cached/ready/generating/checking
  const canPreview = canContinue && 
    (previewCount < PREVIEW_CAP || previewStatus === 'out_of_date') &&
    previewStatus !== 'generating' &&
    previewStatus !== 'checking';
  // Show generate button only when not already displaying an image
  const showGenerateButton = canPreview && previewStatus !== 'cached' && previewStatus !== 'ready';

  const onNameBlur = () => setNameError(validateName(char.name ?? ''));
  const onAgeBlur = () => {
    const a = char.age;
    if (a === undefined || a === null) setAgeError('Please enter an age.');
    else setAgeError(null);
  };

  return (
    <div className="character-builder">
      <h1 className="character-builder__title">Create your character</h1>

      {/* About your child */}
      <section className="character-builder__section">
        <h2 className="character-builder__section-title">About your child</h2>
        <div className="character-builder__row">
          <div className="character-builder__field">
            <label className="character-builder__label" htmlFor="char-name">
              Child&apos;s name
            </label>
            <input
              id="char-name"
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
          </div>
          <div className="character-builder__field character-builder__field--age">
            <label className="character-builder__label" htmlFor="char-age">
              Age
            </label>
            <input
              id="char-age"
              type="number"
              min={0}
              className="character-builder__input character-builder__input--age"
              value={char.age ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? undefined : Number(e.target.value);
                updateCharacter({ age: v });
              }}
              onBlur={onAgeBlur}
              placeholder="0–8"
              aria-invalid={!!ageError}
              aria-describedby={ageError ? 'age-error' : undefined}
            />
            {ageError && <span id="age-error" className="character-builder__error" role="alert">{ageError}</span>}
          </div>
        </div>
        <div className="character-builder__field">
          <label className="character-builder__label" htmlFor="char-pronouns">
            Pronouns
          </label>
          <select
            id="char-pronouns"
            className="character-builder__select"
            value={char.pronouns ?? 'they-them'}
            onChange={(e) => updateCharacter({ pronouns: e.target.value })}
          >
            {PRONOUNS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="character-builder__field">
          <label className="character-builder__label" htmlFor="char-hometown">
            Hometown (optional)
          </label>
          <input
            id="char-hometown"
            type="text"
            className="character-builder__input"
            value={char.hometown ?? ''}
            onChange={(e) => updateCharacter({ hometown: e.target.value || undefined })}
            placeholder={HOMETOWN_DEFAULT}
          />
        </div>
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
          options={getHairStyleOptionsForColor(char.hairColor)}
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

      {/* Preview panel */}
      <section className="character-builder__section character-builder__preview-section">
        <PreviewPanel
          status={previewStatus}
          imageUrl={state.preview?.imageUrl}
          errorMessage={state.preview?.errorMessage}
          onRegenerate={canPreview ? () => handleGeneratePreview(true) : undefined}
          onCancel={previewStatus === 'generating' ? handleCancelPreview : undefined}
        />
        {previewStatus === 'none' && (
          <p className="character-builder__preview-helper">You can continue without a preview.</p>
        )}
      </section>

      {/* CTAs */}
      <div className="character-builder__ctas">
        {showGenerateButton && (
          <button
            type="button"
            className="character-builder__btn character-builder__btn--secondary"
            onClick={() => handleGeneratePreview(false)}
            disabled={!canPreview}
          >
            Generate preview (~45s)
          </button>
        )}
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
        .character-builder { max-width: 640px; margin: 0 auto; }
        .create-loading { font-family: var(--font-body); color: var(--color-soft-charcoal); padding: var(--spacing-md); }
        .character-builder__title { font-family: var(--font-heading); font-size: 1.75rem; font-weight: 700; color: var(--color-navy-midnight); margin-bottom: var(--spacing-lg); }
        .character-builder__section { margin-bottom: calc(var(--spacing-lg, 2rem) + 65px); }
        .character-builder__section-title { font-family: var(--font-ui); font-size: 1.125rem; font-weight: 600; color: var(--color-navy-midnight); margin-bottom: 1.25rem; }
        .character-builder__section > .swatch-picker + .swatch-picker,
        .character-builder__section > .swatch-picker + .trait-grid-picker,
        .character-builder__section > .trait-grid-picker + .swatch-picker,
        .character-builder__section > .trait-grid-picker + .trait-grid-picker { margin-top: 65px; }
        .character-builder__field { margin-bottom: 1.25rem; }
        .character-builder__field:last-child { margin-bottom: 0; }
        .character-builder__row { display: flex; flex-wrap: wrap; gap: 1.25rem; margin-bottom: 1.25rem; align-items: flex-start; }
        .character-builder__row .character-builder__field { margin-bottom: 0; flex: 0 1 auto; min-width: 0; max-width: 280px; }
        .character-builder__row .character-builder__field--age { flex: 0 0 auto; max-width: none; }
        .character-builder__label { display: block; font-family: var(--font-ui); font-size: 0.9375rem; font-weight: 500; color: var(--color-soft-charcoal); margin-bottom: 0.5rem; }
        .character-builder__input { width: 100%; max-width: 280px; padding: 0.625rem 0.875rem; border: 1px solid rgba(45,49,66,0.25); border-radius: 8px; font-family: var(--font-body); font-size: 1rem; min-height: 2.75rem; box-sizing: border-box; }
        .character-builder__input--age { width: 5.5rem; max-width: 5.5rem; min-width: 5.5rem; text-align: center; }
        .character-builder__input:focus { outline: 2px solid var(--color-teal); outline-offset: 2px; }
        .character-builder__error { display: block; font-size: 0.875rem; color: var(--color-hero-coral); margin-top: 0.25rem; }
        .character-builder__helper { display: block; font-size: 0.75rem; color: var(--color-soft-charcoal); opacity: 0.7; margin-top: 0.25rem; }
        .character-builder__select { width: 100%; max-width: 200px; padding: 0.625rem 0.875rem; border: 1px solid rgba(45,49,66,0.25); border-radius: 8px; font-family: var(--font-body); font-size: 1rem; min-height: 2.75rem; background-color: #fff; color: var(--color-soft-charcoal); -webkit-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23333' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 0.75rem center; padding-right: 2rem; }
        .character-builder__select:focus { outline: 2px solid var(--color-teal); outline-offset: 2px; }
        .character-builder__preview-section { margin-top: var(--spacing-xl); text-align: center; }
        .character-builder__preview-helper { font-size: 0.875rem; color: var(--color-soft-charcoal); margin-top: var(--spacing-sm); }
        .character-builder__preview-section .preview-panel { display: inline-block; }
        .character-builder__ctas { display: flex; flex-wrap: wrap; gap: var(--spacing-md); margin-top: var(--spacing-xl); justify-content: center; }
        .character-builder__btn { padding: 0.75rem 2rem; border-radius: 12px; font-family: var(--font-display); font-weight: 700; font-size: 1rem; cursor: pointer; border: none; }
        .character-builder__btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .character-builder__btn--primary { background: var(--color-hero-coral); color: #fff; }
        .character-builder__btn--secondary { background: var(--color-teal); color: #fff; }

        /* Mobile: stack fields/CTAs and avoid fixed widths */
        @media (max-width: 480px) {
          .character-builder__row { gap: var(--spacing-md); }
          .character-builder__row .character-builder__field { flex: 1 1 100%; max-width: none; }
          .character-builder__row .character-builder__field--age { flex: 0 0 auto; }
          .character-builder__input,
          .character-builder__select { max-width: 100%; }
          .character-builder__ctas { flex-direction: column; align-items: stretch; }
          .character-builder__btn { width: 100%; }
        }
      `}</style>
    </div>
  );
}

export default CharacterBuilder;
