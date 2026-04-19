import React, { useEffect, useMemo, useRef, useState } from 'react';

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

interface ZoomItem {
  id: string;
  src: string;
  alt: string;
  spreadIndex: number;
  kind: 'page' | 'front-cover' | 'back-cover';
  pageNumber?: number;
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
  const [zoomedItemIndex, setZoomedItemIndex] = useState<number | null>(null);
  const [imageStatus, setImageStatus] = useState<Record<string, 'loaded' | 'error'>>({});
  const zoomTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Lock body scroll and disable header when image is zoomed
  useEffect(() => {
    if (zoomedItemIndex !== null) {
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
  }, [zoomedItemIndex]);

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
    if (!Array.isArray(viewerSpreads) || viewerSpreads.length === 0 || typeof Image === 'undefined') {
      return;
    }

    const urls = new Set<string>();
    viewerSpreads.forEach((spread) => {
      if (spread.leftPage?.imageUrl) urls.add(spread.leftPage.imageUrl);
      if (spread.rightPage?.imageUrl) urls.add(spread.rightPage.imageUrl);
      if (spread.coverData?.fullImageUrl) urls.add(spread.coverData.fullImageUrl);
    });

    let cancelled = false;
    urls.forEach((url) => {
      if (!url || imageStatus[url]) return;

      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (cancelled) return;
        setImageStatus((prev) => (prev[url] ? prev : { ...prev, [url]: 'loaded' }));
      };
      img.onerror = () => {
        if (cancelled) return;
        setImageStatus((prev) => (prev[url] ? prev : { ...prev, [url]: 'error' }));
      };
      img.src = url;

      if (img.complete && img.naturalWidth > 0) {
        setImageStatus((prev) => (prev[url] ? prev : { ...prev, [url]: 'loaded' }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [viewerSpreads, imageStatus]);

  useEffect(() => {
    if (viewerSpreads.length === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (zoomedItemIndex !== null) {
        if (event.key === 'Escape') {
          closeZoom();
          return;
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          goToZoomItem(zoomedItemIndex - 1);
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          goToZoomItem(zoomedItemIndex + 1);
          return;
        }
      }

      if (event.key === 'Escape') {
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
  }, [currentIndex, viewerSpreads.length, zoomedItemIndex]);

  const totalSpreads = viewerSpreads.length;

  const currentSpread = useMemo(() => {
    if (!Array.isArray(viewerSpreads) || viewerSpreads.length === 0) {
      return null;
    }
    return viewerSpreads[currentIndex] ?? viewerSpreads[0];
  }, [viewerSpreads, currentIndex]);

  const zoomItems = useMemo<ZoomItem[]>(() => {
    if (!Array.isArray(viewerSpreads) || viewerSpreads.length === 0) {
      return [];
    }

    const items: ZoomItem[] = [];
    viewerSpreads.forEach((spread, spreadIndex) => {
      if (spread.coverData?.isFrontCover && spread.coverData.fullImageUrl) {
        items.push({
          id: `spread-${spreadIndex}-front-cover`,
          src: spread.coverData.fullImageUrl,
          alt: 'Front Cover',
          spreadIndex,
          kind: 'front-cover',
        });
        return;
      }

      if (spread.leftPage?.imageUrl) {
        items.push({
          id: `spread-${spreadIndex}-left-${spread.leftPage.pageNumber}`,
          src: spread.leftPage.imageUrl,
          alt: `Page ${spread.leftPage.pageNumber}`,
          spreadIndex,
          kind: 'page',
          pageNumber: spread.leftPage.pageNumber,
        });
      }

      if (spread.rightPage?.imageUrl) {
        items.push({
          id: `spread-${spreadIndex}-right-${spread.rightPage.pageNumber}`,
          src: spread.rightPage.imageUrl,
          alt: `Page ${spread.rightPage.pageNumber}`,
          spreadIndex,
          kind: 'page',
          pageNumber: spread.rightPage.pageNumber,
        });
      }

      if (spread.coverData?.isBackCover && spread.coverData.fullImageUrl) {
        items.push({
          id: `spread-${spreadIndex}-back-cover`,
          src: spread.coverData.fullImageUrl,
          alt: 'Back Cover',
          spreadIndex,
          kind: 'back-cover',
        });
      }
    });

    return items;
  }, [viewerSpreads]);

  const zoomedItem =
    zoomedItemIndex !== null && zoomedItemIndex >= 0 && zoomedItemIndex < zoomItems.length
      ? zoomItems[zoomedItemIndex]
      : null;

  const currentSpreadUrls = useMemo(() => {
    if (!currentSpread) return [];
    const urls: string[] = [];
    if (currentSpread.leftPage?.imageUrl) urls.push(currentSpread.leftPage.imageUrl);
    if (currentSpread.rightPage?.imageUrl) urls.push(currentSpread.rightPage.imageUrl);
    if (currentSpread.coverData?.fullImageUrl) urls.push(currentSpread.coverData.fullImageUrl);
    return urls;
  }, [currentSpread]);

  const currentSpreadReady =
    currentSpreadUrls.length === 0 ||
    currentSpreadUrls.every((url) => imageStatus[url] === 'loaded');
  const currentSpreadHasError = currentSpreadUrls.some((url) => imageStatus[url] === 'error');

  useEffect(() => {
    if (zoomedItemIndex === null) return;
    if (zoomItems.length === 0) {
      setZoomedItemIndex(null);
      return;
    }
    if (zoomedItemIndex >= zoomItems.length) {
      setZoomedItemIndex(zoomItems.length - 1);
    }
  }, [zoomItems, zoomedItemIndex]);

  const goToSpread = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= totalSpreads) return;
    setCurrentIndex(nextIndex);
    onSpreadChange?.(nextIndex);
  };

  const goToZoomItem = (nextIndex: number) => {
    if (zoomItems.length === 0) return;
    const clamped = clampIndex(nextIndex, zoomItems.length);
    const nextItem = zoomItems[clamped];
    if (!nextItem) return;
    setZoomedItemIndex(clamped);
    if (nextItem.spreadIndex !== currentIndex) {
      setCurrentIndex(nextItem.spreadIndex);
      onSpreadChange?.(nextItem.spreadIndex);
    }
  };

  const openZoomItem = (matcher: (item: ZoomItem) => boolean) => {
    const index = zoomItems.findIndex(matcher);
    if (index === -1) return;
    goToZoomItem(index);
  };

  const closeZoom = () => {
    zoomTouchStartRef.current = null;
    setZoomedItemIndex(null);
  };

  const renderLeftPage = () => {
    if (!currentSpread) return null;

    if (currentSpread.coverData?.isBackCover && currentSpread.coverData.fullImageUrl) {
      return (
        <div 
          key={`back-cover-${currentIndex}`}
          className="cover-image-container back-cover zoomable-image"
          onClick={() =>
            openZoomItem(
              (item) => item.kind === 'back-cover' && item.spreadIndex === currentIndex
            )
          }
        >
          <img src={currentSpread.coverData.fullImageUrl} alt="Back Cover" loading="eager" />
        </div>
      );
    }

    if (currentSpread.leftPage?.imageUrl) {
      return (
        <img
          key={`left-${currentIndex}-${currentSpread.leftPage.pageNumber}`}
          src={currentSpread.leftPage.imageUrl}
          alt={`Page ${currentSpread.leftPage.pageNumber}`}
          className="zoomable-image"
          onClick={() =>
            openZoomItem(
              (item) =>
                item.kind === 'page' &&
                item.pageNumber === currentSpread.leftPage!.pageNumber &&
                item.spreadIndex === currentIndex
            )
          }
          loading="eager"
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
          key={`front-cover-${currentIndex}`}
          className="cover-image-container front-cover zoomable-image"
          onClick={() =>
            openZoomItem(
              (item) => item.kind === 'front-cover' && item.spreadIndex === currentIndex
            )
          }
        >
          <img src={currentSpread.coverData.fullImageUrl} alt="Front Cover" loading="eager" />
        </div>
      );
    }

    if (currentSpread.rightPage?.imageUrl) {
      return (
        <img
          key={`right-${currentIndex}-${currentSpread.rightPage.pageNumber}`}
          src={currentSpread.rightPage.imageUrl}
          alt={`Page ${currentSpread.rightPage.pageNumber}`}
          className="zoomable-image"
          onClick={() =>
            openZoomItem(
              (item) =>
                item.kind === 'page' &&
                item.pageNumber === currentSpread.rightPage!.pageNumber &&
                item.spreadIndex === currentIndex
            )
          }
          loading="eager"
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
          {!currentSpreadReady && !currentSpreadHasError && (
            <div className="spread-loading-state" aria-live="polite">
              Loading spread…
            </div>
          )}
          {currentSpreadHasError && (
            <div className="spread-error-state" role="status" aria-live="polite">
              Some preview images failed to load. Try moving to the next spread and back.
            </div>
          )}
          <div className="two-page-spread">
            {renderLeftPage()}
            {renderRightPage()}
          </div>
        </div>
      </div>

      {zoomedItem && (
        <div 
          className="image-zoom-modal"
          onClick={(e) => {
            // Only close if clicking the backdrop, not the image or button
            if (e.target === e.currentTarget) {
              closeZoom();
            }
          }}
          onMouseDown={(e) => {
            // Prevent any clicks from reaching elements behind the modal
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          onTouchStart={(e) => {
            const touch = e.touches[0];
            if (!touch) return;
            zoomTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(e) => {
            if (zoomedItemIndex === null || !zoomTouchStartRef.current) return;
            const touch = e.changedTouches[0];
            if (!touch) return;
            const deltaX = touch.clientX - zoomTouchStartRef.current.x;
            const deltaY = touch.clientY - zoomTouchStartRef.current.y;
            zoomTouchStartRef.current = null;
            if (Math.abs(deltaX) <= 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
            if (deltaX < 0) {
              goToZoomItem(zoomedItemIndex + 1);
            } else {
              goToZoomItem(zoomedItemIndex - 1);
            }
          }}
        >
          <button 
            className="image-zoom-close"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent?.stopImmediatePropagation?.();
              closeZoom();
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

          <button
            className="image-zoom-nav image-zoom-nav-left"
            type="button"
            aria-label="Previous page"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (zoomedItemIndex !== null) goToZoomItem(zoomedItemIndex - 1);
            }}
            disabled={zoomedItemIndex === 0}
          >
            ‹
          </button>

          <div
            className="image-zoom-content"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <img 
              src={zoomedItem.src} 
              alt={zoomedItem.alt}
            />
            <div className="image-zoom-caption">
              <span>{zoomedItem.alt}</span>
              <span>
                {zoomedItemIndex! + 1} / {zoomItems.length}
              </span>
            </div>
          </div>

          <button
            className="image-zoom-nav image-zoom-nav-right"
            type="button"
            aria-label="Next page"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (zoomedItemIndex !== null) goToZoomItem(zoomedItemIndex + 1);
            }}
            disabled={zoomedItemIndex === zoomItems.length - 1}
          >
            ›
          </button>
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
          position: relative;
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

        .image-zoom-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.9rem;
          width: min(92vw, 1100px);
          max-height: calc(100vh - 3rem);
        }

        .image-zoom-caption {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          width: min(92vw, 960px);
          color: white;
          font-family: var(--font-ui, 'Poppins', sans-serif);
          font-size: 0.95rem;
          background: rgba(17, 24, 39, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 999px;
          padding: 0.6rem 1rem;
          backdrop-filter: blur(8px);
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

        .image-zoom-nav {
          position: fixed;
          top: 50%;
          transform: translateY(-50%);
          width: 3rem;
          height: 3rem;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.35);
          background: rgba(17, 24, 39, 0.55);
          color: white;
          font-size: 2rem;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          z-index: 2147483647 !important;
          backdrop-filter: blur(10px);
        }

        .image-zoom-nav:hover:not(:disabled) {
          background: rgba(17, 24, 39, 0.8);
          border-color: rgba(255, 255, 255, 0.7);
        }

        .image-zoom-nav:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .image-zoom-nav-left {
          left: 1rem;
        }

        .image-zoom-nav-right {
          right: 1rem;
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

          .image-zoom-content {
            width: calc(100vw - 1.5rem);
            max-height: calc(100vh - 5.5rem);
          }

          .image-zoom-caption {
            width: 100%;
            font-size: 0.85rem;
            padding: 0.55rem 0.8rem;
          }

          .image-zoom-nav {
            width: 2.5rem;
            height: 2.5rem;
            font-size: 1.75rem;
            top: auto;
            bottom: max(1rem, env(safe-area-inset-bottom, 0px) + 0.5rem);
            transform: none;
          }

          .image-zoom-nav-left {
            left: 0.75rem;
          }

          .image-zoom-nav-right {
            right: 0.75rem;
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

        .spread-loading-state,
        .spread-error-state {
          position: absolute;
          top: 1rem;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2;
          padding: 0.5rem 0.85rem;
          border-radius: 999px;
          font-size: 0.85rem;
          font-weight: 500;
          font-family: var(--font-ui, 'Poppins', sans-serif);
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
        }

        .spread-loading-state {
          background: rgba(255, 255, 255, 0.92);
          color: #374151;
        }

        .spread-error-state {
          background: rgba(127, 29, 29, 0.92);
          color: white;
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
