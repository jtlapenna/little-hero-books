import React, { useEffect, useMemo, useState } from 'react';

export interface PageData {
  pageNumber: number;
  imageUrl: string;
}

export interface CoverData {
  fullImageUrl: string;
  isFrontCover?: boolean;
  isBackCover?: boolean;
}

export interface SpreadData {
  spreadNumber: number;
  leftPage?: PageData | null;
  rightPage?: PageData | null;
  coverData?: CoverData | null;
  isCover?: boolean;
  isBackCover?: boolean;
}

interface BookSpreadViewerProps {
  spreads?: SpreadData[];
  initialSpread?: number;
  onSpreadChange?: (index: number) => void;
  /**
   * Optional browser event name to listen for dynamic spread updates.
   * The event detail should be: { spreads: SpreadData[], initialSpread?: number }
   */
  externalEventName?: string;
}

const clampIndex = (index: number, total: number) => {
  if (total <= 0) return 0;
  if (index < 0) return 0;
  if (index >= total) return total - 1;
  return index;
};

const BookSpreadViewer: React.FC<BookSpreadViewerProps> = ({
  spreads = [],
  initialSpread = 0,
  onSpreadChange,
  externalEventName,
}) => {
  const [viewerSpreads, setViewerSpreads] = useState<SpreadData[]>(() =>
    Array.isArray(spreads) ? spreads : []
  );
  const [currentIndex, setCurrentIndex] = useState(() =>
    clampIndex(initialSpread, viewerSpreads.length)
  );
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // Lock body scroll and disable header when image is zoomed
  useEffect(() => {
    if (zoomedImage) {
      const originalOverflow = document.body.style.overflow;
      const originalPosition = document.body.style.position;
      const header = document.getElementById('main-header');
      const originalHeaderPointerEvents = header?.style.pointerEvents;
      
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      
      // Disable header pointer events to prevent clicks from reaching it
      if (header) {
        header.style.pointerEvents = 'none';
      }
      
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.position = originalPosition;
        document.body.style.width = '';
        
        // Re-enable header pointer events
        if (header) {
          header.style.pointerEvents = originalHeaderPointerEvents || '';
        }
      };
    }
  }, [zoomedImage]);

  useEffect(() => {
    const nextSpreads = Array.isArray(spreads) ? spreads : [];
    setViewerSpreads(nextSpreads);
    setCurrentIndex((prev) => {
      const nextInitial = clampIndex(initialSpread, nextSpreads.length);
      return prev === nextInitial ? prev : nextInitial;
    });
  }, [spreads, initialSpread]);

  useEffect(() => {
    if (!externalEventName) return;

    const handleSpreadsUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        spreads?: SpreadData[];
        initialSpread?: number;
      }>;
      const detail = customEvent.detail || {};
      const nextSpreads = Array.isArray(detail.spreads) ? detail.spreads : [];
      setViewerSpreads(nextSpreads);
      const nextInitial = typeof detail.initialSpread === 'number' ? detail.initialSpread : 0;
      setCurrentIndex(clampIndex(nextInitial, nextSpreads.length));
    };

    window.addEventListener(externalEventName, handleSpreadsUpdate as EventListener);
    return () => window.removeEventListener(externalEventName, handleSpreadsUpdate as EventListener);
  }, [externalEventName]);

  useEffect(() => {
    if (viewerSpreads.length === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (zoomedImage && event.key === 'Escape') {
        setZoomedImage(null);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToSpread(currentIndex - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToSpread(currentIndex + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, viewerSpreads.length, zoomedImage]);

  const totalSpreads = viewerSpreads.length;

  const currentSpread = useMemo(() => {
    if (!Array.isArray(viewerSpreads) || viewerSpreads.length === 0) {
      return null;
    }
    return viewerSpreads[currentIndex] ?? viewerSpreads[0];
  }, [viewerSpreads, currentIndex]);

  const goToSpread = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= totalSpreads) return;
    setCurrentIndex(nextIndex);
    onSpreadChange?.(nextIndex);
  };

  const renderLeftPage = () => {
    if (!currentSpread) return null;

    if (currentSpread.coverData?.isBackCover && currentSpread.coverData.fullImageUrl) {
      return (
        <div 
          className="cover-image-container back-cover zoomable-image"
          onClick={() => setZoomedImage(currentSpread.coverData!.fullImageUrl)}
        >
          <img src={currentSpread.coverData.fullImageUrl} alt="Back Cover" />
        </div>
      );
    }

    if (currentSpread.leftPage?.imageUrl) {
      return (
        <img
          src={currentSpread.leftPage.imageUrl}
          alt={`Page ${currentSpread.leftPage.pageNumber}`}
          className="zoomable-image"
          onClick={() => setZoomedImage(currentSpread.leftPage!.imageUrl)}
          style={{ cursor: 'pointer' }}
        />
      );
    }

    return <div className="white-page" />;
  };

  const renderRightPage = () => {
    if (!currentSpread) return null;

    if (currentSpread.coverData?.isFrontCover && currentSpread.coverData.fullImageUrl) {
      return (
        <div 
          className="cover-image-container front-cover zoomable-image"
          onClick={() => setZoomedImage(currentSpread.coverData!.fullImageUrl)}
        >
          <img src={currentSpread.coverData.fullImageUrl} alt="Front Cover" />
        </div>
      );
    }

    if (currentSpread.rightPage?.imageUrl) {
      return (
        <img
          src={currentSpread.rightPage.imageUrl}
          alt={`Page ${currentSpread.rightPage.pageNumber}`}
          className="zoomable-image"
          onClick={() => setZoomedImage(currentSpread.rightPage!.imageUrl)}
          style={{ cursor: 'pointer' }}
        />
      );
    }

    return <div className="white-page" />;
  };

  if (!currentSpread) {
    return (
      <div className="empty-state">
        <p>No spreads available.</p>
      </div>
    );
  }

  return (
    <div className="book-viewer">
      <div className="viewer-header">
        <span>
          Spread {currentIndex + 1} of {totalSpreads}
          {currentSpread.coverData?.isFrontCover && <span className="spread-label"> (Front Cover)</span>}
          {currentSpread.coverData?.isBackCover && <span className="spread-label"> (Back Cover)</span>}
          {!currentSpread.coverData && currentSpread.leftPage && currentSpread.rightPage && (
            <span className="spread-label">
              {' '}
              (Pages {currentSpread.leftPage.pageNumber} &amp; {currentSpread.rightPage.pageNumber})
            </span>
          )}
        </span>

        <div className="spread-controls">
          <button
            className="spread-nav-btn"
            aria-label="Previous spread"
            onClick={() => goToSpread(currentIndex - 1)}
            disabled={currentIndex === 0}
          >
            ‹
          </button>
          <button
            className="spread-nav-btn"
            aria-label="Next spread"
            onClick={() => goToSpread(currentIndex + 1)}
            disabled={currentIndex >= totalSpreads - 1}
          >
            ›
          </button>
        </div>
      </div>

      <div className="spread-viewer">
        <div className="spread-container">
          <div className="two-page-spread">
            {renderLeftPage()}
            {renderRightPage()}
          </div>
        </div>
      </div>

      {zoomedImage && (
        <div 
          className="image-zoom-modal"
          onClick={(e) => {
            // Only close if clicking the backdrop, not the image or button
            if (e.target === e.currentTarget) {
              setZoomedImage(null);
            }
          }}
          onMouseDown={(e) => {
            // Prevent any clicks from reaching elements behind the modal
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
        >
          <button 
            className="image-zoom-close"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent?.stopImmediatePropagation?.();
              setZoomedImage(null);
              return false;
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent?.stopImmediatePropagation?.();
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            aria-label="Close zoomed image"
          >
            ×
          </button>
          <img 
            src={zoomedImage} 
            alt="Zoomed view"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <style>{`
        .book-viewer {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 6px rgba(15, 23, 42, 0.05);
        }

        .viewer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #e5e7eb;
          font-family: var(--font-ui, 'Poppins', sans-serif);
          font-size: 0.95rem;
          color: #1f2937;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .spread-label {
          color: #6b7280;
          margin-left: 0.4rem;
          font-size: 0.9em;
        }

        .spread-controls {
          display: flex;
          gap: 0.5rem;
        }

        .spread-nav-btn {
          width: 2.25rem;
          height: 2.25rem;
          border-radius: 999px;
          border: 1px solid #d1d5db;
          background: #fff;
          color: #4b5563;
          font-size: 1.2rem;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .spread-nav-btn:hover:not(:disabled) {
          border-color: #9ca3af;
          color: #1f2937;
          transform: translateY(-1px);
        }

        .spread-nav-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .spread-viewer {
          background: #f3f4f6;
          padding: 2.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          max-height: 70vh;
          overflow: hidden;
        }
        
        @media (max-width: 768px) {
          .spread-viewer {
            padding: 0.5rem;
            max-height: 40vh;
          }
        }

        .spread-container {
          width: 100%;
          max-width: 900px;
          max-height: 100%;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .two-page-spread {
          display: flex;
          gap: 0;
          width: 100%;
          max-width: 100%;
          height: auto;
          background: #ffffff;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          border-radius: 8px;
          overflow: hidden;
        }

        .two-page-spread img {
          width: 50%;
          height: auto;
          object-fit: contain;
          display: block;
          aspect-ratio: 1 / 1;
        }

        .zoomable-image {
          cursor: pointer;
          transition: opacity 0.2s ease;
        }

        .zoomable-image:hover {
          opacity: 0.9;
        }

        .image-zoom-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.95);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2147483647 !important;
          padding: 1rem;
          cursor: pointer;
          overscroll-behavior: contain;
          isolation: isolate;
          pointer-events: auto;
        }
        
        /* Ensure header is below modal */
        .image-zoom-modal ~ *,
        .image-zoom-modal + * {
          pointer-events: none;
        }
        
        /* Prevent header from being clickable when modal is open */
        body:has(.image-zoom-modal) #main-header,
        body:has(.image-zoom-modal) .header {
          pointer-events: none !important;
          z-index: 1000 !important;
        }

        .image-zoom-modal img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          cursor: default;
        }

        .image-zoom-close {
          position: fixed;
          top: 1rem;
          right: 1rem;
          background: rgba(255, 255, 255, 0.2);
          border: 2px solid rgba(255, 255, 255, 0.5);
          color: white;
          font-size: 2rem;
          width: 3rem;
          height: 3rem;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          z-index: 2147483647 !important;
          pointer-events: auto !important;
          isolation: isolate;
          touch-action: manipulation;
        }

        .image-zoom-close:hover {
          background: rgba(255, 255, 255, 0.3);
          border-color: rgba(255, 255, 255, 0.8);
          transform: scale(1.1);
        }

        @media (max-width: 768px) {
          .image-zoom-close {
            top: calc(env(safe-area-inset-top, 0px) + 3.5rem) !important;
            right: 0.5rem;
            width: 2.5rem;
            height: 2.5rem;
            font-size: 1.5rem;
            z-index: 2147483647 !important;
            isolation: isolate;
            pointer-events: auto !important;
            touch-action: manipulation;
          }
          
          .image-zoom-modal {
            z-index: 2147483647 !important;
            isolation: isolate;
            pointer-events: auto !important;
          }

          .cover-image-container.zoomable-image {
            cursor: pointer;
          }
        }
        
        @media (max-width: 768px) and (orientation: landscape) {
          .image-zoom-close {
            top: calc(env(safe-area-inset-top, 0px) + 3.5rem) !important;
            right: 0.5rem;
            width: 2.5rem;
            height: 2.5rem;
            font-size: 1.5rem;
            z-index: 2147483647 !important;
            isolation: isolate;
            pointer-events: auto !important;
            touch-action: manipulation;
          }
          
          .image-zoom-modal {
            z-index: 2147483647 !important;
            isolation: isolate;
            pointer-events: auto !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
          }
        }

        .white-page {
          width: 50%;
          aspect-ratio: 1 / 1;
          background-color: white;
        }

        .cover-image-container {
          width: 50%;
          aspect-ratio: 1 / 1;
          overflow: hidden;
          position: relative;
          background-color: white;
        }

        .cover-image-container img {
          width: 200%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
        }

        .cover-image-container.front-cover img {
          object-position: right center;
        }

        .cover-image-container.back-cover img {
          object-position: left center;
        }

        .empty-state {
          padding: 2rem;
          text-align: center;
          color: #6b7280;
        }

        @media (max-width: 768px) and (orientation: portrait) {
          .spread-viewer {
            padding: 0.5rem;
            max-height: 40vh;
          }

          .two-page-spread img,
          .cover-image-container img {
            max-height: 35vh;
          }

          .cover-image-container.zoomable-image {
            cursor: pointer;
          }
        }

        @media (max-width: 768px) and (orientation: landscape) {
          .spread-viewer {
            max-height: 85vh;
            padding: 1rem;
          }

          .two-page-spread img,
          .cover-image-container img {
            max-height: 75vh;
          }

          .viewer-header {
            padding: 0.75rem 1rem;
            font-size: 0.85rem;
          }
          
          .cover-image-container.zoomable-image {
            cursor: pointer;
          }
        }
      `}</style>
    </div>
  );
};

export default BookSpreadViewer;

