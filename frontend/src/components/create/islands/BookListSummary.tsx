/**
 * Review page island: shows all books in the cart, with edit/remove,
 * "Add Another Book" and "Continue to Checkout" CTAs.
 */

import { useEffect, useState, useCallback } from 'react';
import { load, addBook, removeBook, switchBook } from '../../../lib/createFlow/createFlowStorage';
import type { CreateFlowState, CreateFlowBookEntry } from '../../../lib/createFlow/createFlowSchema';
import { isCharacterStepComplete } from '../../../lib/createFlow/createFlowSelectors';

const MAX_BOOKS = 5;

function BookListSummary() {
  const [state, setState] = useState<CreateFlowState | null>(null);

  useEffect(() => {
    const loaded = load();
    if (!loaded || !isCharacterStepComplete(loaded)) {
      window.location.href = '/create/character?toast=missing_state';
      return;
    }
    setState(loaded);
  }, []);

  const refresh = useCallback(() => setState(load()), []);

  const handleEdit = useCallback((index: number) => {
    switchBook(index);
    window.location.href = '/create/character';
  }, []);

  const handleRemove = useCallback((index: number) => {
    removeBook(index);
    refresh();
  }, [refresh]);

  const handleAddAnother = useCallback(() => {
    addBook();
    window.location.href = '/create/character';
  }, []);

  const handleCheckout = useCallback(() => {
    window.location.href = '/create/checkout';
  }, []);

  if (!state) return <p className="review-loading">Loading…</p>;

  const books = state.books;

  return (
    <div className="review">
      <h1 className="review__title">Review your order</h1>
      <p className="review__subtitle">
        {books.length === 1
          ? 'You have 1 book in your order.'
          : `You have ${books.length} books in your order.`}
      </p>

      <div className="review__list">
        {books.map((book, i) => (
          <BookCard
            key={book.id}
            book={book}
            index={i}
            total={books.length}
            onEdit={() => handleEdit(i)}
            onRemove={() => handleRemove(i)}
          />
        ))}
      </div>

      <div className="review__ctas">
        {books.length < MAX_BOOKS && (
          <button
            type="button"
            className="review__btn review__btn--secondary"
            onClick={handleAddAnother}
          >
            + Add another book
          </button>
        )}
        <button
          type="button"
          className="review__btn review__btn--primary"
          onClick={handleCheckout}
        >
          Continue to checkout
        </button>
      </div>

      <style>{`
        .review { max-width: 640px; margin: 0 auto; }
        .review-loading { font-family: var(--font-body); color: var(--color-soft-charcoal); padding: var(--spacing-md); }

        .review__title {
          font-family: var(--font-heading);
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--color-navy-midnight);
          margin-bottom: var(--spacing-xs);
        }
        .review__subtitle {
          font-family: var(--font-body);
          font-size: 1rem;
          color: var(--color-soft-charcoal);
          margin-bottom: var(--spacing-lg);
        }

        .review__list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-xl);
        }

        .review__ctas {
          display: flex;
          flex-wrap: wrap;
          gap: var(--spacing-md);
          margin-top: var(--spacing-lg);
        }
        .review__btn {
          padding: 0.75rem 2rem;
          border-radius: 12px;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          border: none;
        }
        .review__btn--primary {
          background: var(--color-hero-coral);
          color: #fff;
        }
        .review__btn--secondary {
          background: transparent;
          color: var(--color-teal, #5AC6B1);
          border: 2px dashed var(--color-teal, #5AC6B1);
        }
        .review__btn--secondary:hover {
          background: rgba(90,198,177,0.08);
        }

        @media (max-width: 480px) {
          .review__ctas { flex-direction: column; }
          .review__btn { width: 100%; }
        }

        /* Book card */
        .book-card {
          background: var(--color-warm-sand, #F1FAEE);
          border-radius: 12px;
          padding: var(--spacing-md);
          display: flex;
          gap: var(--spacing-md);
          align-items: flex-start;
        }
        .book-card__preview {
          width: 80px;
          height: 80px;
          object-fit: contain;
          border-radius: 8px;
          background: #fff;
          flex-shrink: 0;
        }
        .book-card__placeholder {
          width: 80px;
          height: 80px;
          border-radius: 8px;
          background: #e0e0e0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          flex-shrink: 0;
        }
        .book-card__info { flex: 1; min-width: 0; }
        .book-card__number {
          font-family: var(--font-ui);
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--color-soft-charcoal);
          margin-bottom: 0.25rem;
        }
        .book-card__name {
          font-family: var(--font-heading);
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--color-navy-midnight);
          margin: 0 0 0.25rem;
        }
        .book-card__details {
          font-family: var(--font-body);
          font-size: 0.875rem;
          color: var(--color-soft-charcoal);
          margin: 0;
        }
        .book-card__actions {
          display: flex;
          gap: var(--spacing-sm);
          margin-top: var(--spacing-sm);
        }
        .book-card__action {
          font-family: var(--font-ui);
          font-size: 0.8125rem;
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          border: 1px solid rgba(45,49,66,0.2);
          background: #fff;
          color: var(--color-soft-charcoal);
        }
        .book-card__action:hover { background: rgba(45,49,66,0.05); }
        .book-card__action--remove { color: #c0392b; border-color: rgba(192,57,43,0.3); }
        .book-card__action--remove:hover { background: rgba(192,57,43,0.05); }
      `}</style>
    </div>
  );
}

function BookCard({
  book,
  index,
  total,
  onEdit,
  onRemove,
}: {
  book: CreateFlowBookEntry;
  index: number;
  total: number;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const name = book.character?.name || 'Unnamed';
  const age = book.character?.age;
  const animal = book.character?.favoriteAnimal;

  return (
    <div className="book-card">
      {book.preview?.imageUrl ? (
        <img src={book.preview.imageUrl} alt={`${name} preview`} className="book-card__preview" />
      ) : (
        <div className="book-card__placeholder">📖</div>
      )}
      <div className="book-card__info">
        <div className="book-card__number">Book {index + 1}</div>
        <p className="book-card__name">{name}'s Adventure</p>
        <p className="book-card__details">
          {age != null && `Age ${age}`}
          {animal && ` · ${animal.charAt(0).toUpperCase() + animal.slice(1)}`}
          {book.dedication && ' · Has dedication'}
        </p>
        <div className="book-card__actions">
          <button type="button" className="book-card__action" onClick={onEdit}>Edit</button>
          {total > 1 && (
            <button type="button" className="book-card__action book-card__action--remove" onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BookListSummary;
