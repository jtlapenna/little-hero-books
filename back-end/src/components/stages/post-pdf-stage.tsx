'use client';

import { useEffect, useState, useRef } from 'react';
import { CheckCircle, Play, Download, Flag, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { setFlaggedCount } from '@/lib/review-state';
import { Order } from '@/types/order';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

interface PostPdfStageProps {
  orderId: string;
  order: Order;
  isApproved: boolean;
  onApprove: () => void;
  onInitiateWorkflow: () => void;
  onRefresh?: () => void;
}

interface PageData {
  pageNumber: number;
  previewImageUrl: string;
}

interface CoverData {
  fullImageUrl: string;
  isFrontCover?: boolean; // true for front cover (right half), false for back cover (left half)
  isBackCover?: boolean;
}

interface SpreadData {
  spreadNumber: number;
  leftPage?: PageData;
  rightPage?: PageData;
  coverData?: CoverData; // For cover spreads
  isCover: boolean;
  isBackCover: boolean;
}

// Create spreads from pages, including cover pages if cover image is available
function createSpreads(pages: PageData[], coverImageUrl?: string): SpreadData[] {
  const spreads: SpreadData[] = [];
  
  // Add front cover spread (right half of cover image) if cover is available
  if (coverImageUrl) {
    spreads.push({
      spreadNumber: 0,
      leftPage: undefined,
      rightPage: undefined,
      coverData: {
        fullImageUrl: coverImageUrl,
        isFrontCover: true,
        isBackCover: false
      },
      isCover: true,
      isBackCover: false
    });
  }
  
  // Interior spreads (pages 1-14, paired)
  for (let i = 0; i < pages.length; i += 2) {
    spreads.push({
      spreadNumber: spreads.length, // Continue numbering from cover
      leftPage: pages[i],
      rightPage: pages[i + 1] || undefined, // Last spread might have only left page
      isCover: false,
      isBackCover: false
    });
  }
  
  // Add back cover spread (left half of cover image) if cover is available
  if (coverImageUrl) {
    spreads.push({
      spreadNumber: spreads.length,
      leftPage: undefined,
      rightPage: undefined,
      coverData: {
        fullImageUrl: coverImageUrl,
        isFrontCover: false,
        isBackCover: true
      },
      isCover: false,
      isBackCover: true
    });
  }
  
  return spreads;
}

export function PostPdfStage({ orderId, order, isApproved, onApprove, onInitiateWorkflow, onRefresh }: PostPdfStageProps) {
  const [pdfAsset, setPdfAsset] = useState({
    id: 'compiled-pdf',
    name: 'Compiled PDF',
    url: '',
    isFlagged: false,
    exists: false,
    loading: true,
    error: null as string | null
  });

  const [pages, setPages] = useState<PageData[]>([]);
  const [spreads, setSpreads] = useState<SpreadData[]>([]);
  const [currentSpreadIndex, setCurrentSpreadIndex] = useState(0);
  const [loadingPages, setLoadingPages] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState({ left: true, right: true });
  const [imageError, setImageError] = useState<{ left: string | null; right: string | null }>({ left: null, right: null });
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverImageLoading, setCoverImageLoading] = useState(false);
  const [coverImageDataUrl, setCoverImageDataUrl] = useState<string | null>(null); // For PDFs converted to images
  const coverCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const pdfPath = `book-mvp-simple-adventure/orders/${orderId}/complete_book_${orderId}.pdf`;
  const pdfUrl = `/api/pdf/${pdfPath}`;

  // Track if images have been successfully loaded from manifest (stop polling once found)
  const imagesFoundRef = useRef(false);
  // Track last loaded pages data to prevent unnecessary re-renders
  const lastPagesDataRef = useRef<string>('');

  // Reset ref and spread index when orderId changes
  useEffect(() => {
    imagesFoundRef.current = false;
    lastPagesDataRef.current = '';
    setCoverImageUrl(null);
    setCoverImageDataUrl(null);
    setCurrentSpreadIndex(0); // Always start at first spread when viewing a new order
  }, [orderId]);

  // Helper function to convert PDF to image using PDF.js
  const convertPdfToImage = async (pdfUrl: string): Promise<string> => {
    try {
      console.log('[Pages] Converting PDF to image:', pdfUrl);
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1); // Get first page
      
      // Set scale for high quality (2x for retina displays)
      const scale = 2;
      const viewport = page.getViewport({ scale });
      
      // Create canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not get canvas context');
      }
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      // Render PDF page to canvas
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
      // Convert canvas to data URL
      const dataUrl = canvas.toDataURL('image/png');
      console.log('[Pages] ✓ PDF converted to image successfully');
      return dataUrl;
    } catch (error) {
      console.error('[Pages] Error converting PDF to image:', error);
      throw error;
    }
  };

  // Load preview images from 3-manifest or construct directly from R2
  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const loadPages = async () => {
      if (!isMounted) return;

      // Don't reload if we already have images from the manifest
      if (imagesFoundRef.current) {
        console.log('[Pages] Images already found, skipping reload');
        return;
      }

      setLoadingPages(true);
      setPagesError(null);

      try {
        // Try 3-manifest first (has preview images with correct URLs)
        const manifest3Key = `book-mvp-simple-adventure/orders/${orderId}/manifests/3-manifest.json`;
        const manifest3Url = `/api/manifests/${manifest3Key}`; // Use relative URL
        
        let pageData: PageData[] = [];
        let foundInManifest = false;
        
        try {
          const manifest3Res = await fetch(manifest3Url);
          
          if (manifest3Res.ok) {
            const manifest3 = await manifest3Res.json();
            const previewImages = manifest3?.bookAssembly?.pagePreviewImages;
            
            if (previewImages && Array.isArray(previewImages) && previewImages.length > 0) {
              foundInManifest = true;
              // Use preview images from manifest
              pageData = previewImages
                .sort((a: any, b: any) => a.pageNumber - b.pageNumber)
                .map((img: any) => {
                  // Always construct relative URL from r2Key to ensure preview deployments call their own API
                  // Ignore imageUrl from manifest as it may contain absolute URLs pointing to production
                  let imageUrl: string;
                  if (img.r2Key) {
                    // Use relative URL so it works with any deployment (production or preview)
                    imageUrl = `/api/assets/${img.r2Key}`;
                  } else {
                    // Fallback: try to extract r2Key from imageUrl if it's an absolute URL
                    const fallbackUrl = img.imageUrl || '';
                    const r2KeyMatch = fallbackUrl.match(/\/api\/assets\/(.+)$/);
                    if (r2KeyMatch) {
                      imageUrl = `/api/assets/${r2KeyMatch[1]}`;
                    } else {
                      // Last resort: construct from page number
                      imageUrl = `/api/assets/book-mvp-simple-adventure/orders/${orderId}/preview-images/page-${String(img.pageNumber).padStart(2, '0')}_preview.png`;
                    }
                  }
                  
                  console.log(`[Pages] Page ${img.pageNumber}:`, {
                    hasImageUrl: !!img.imageUrl,
                    hasR2Key: !!img.r2Key,
                    constructedUrl: imageUrl,
                    r2Key: img.r2Key
                  });
                  
                  return {
                    pageNumber: img.pageNumber,
                    previewImageUrl: imageUrl
                  };
                });
              
              console.log('[Pages] ✓ Loaded preview images from 3-manifest:', pageData.length);
              console.log('[Pages] First page URL:', pageData[0]?.previewImageUrl);
            }
          }
        } catch (e) {
          console.log('[Pages] 3-manifest fetch error:', e);
        }
        
        // Fallback: Construct image URLs directly from R2 path pattern
        if (pageData.length === 0) {
          console.log('[Pages] Constructing preview image URLs from R2 path pattern');
          // Images are stored at: book-mvp-simple-adventure/orders/{orderId}/preview-images/page-{pageNumber}_preview.png
          pageData = Array.from({ length: 14 }, (_, i) => {
            const pageNum = i + 1;
            const r2Key = `book-mvp-simple-adventure/orders/${orderId}/preview-images/page-${String(pageNum).padStart(2, '0')}_preview.png`;
            return {
              pageNumber: pageNum,
              previewImageUrl: `/api/assets/${r2Key}` // Use relative URL
            };
          });
        }
        
        if (!isMounted) return;
        
        // Try to load cover PDF image if not already loaded
        if (!coverImageUrl && !coverImageDataUrl) {
          setCoverImageLoading(true);
          try {
            // Cover PDF path: book-mvp-simple-adventure/orders/{orderId}/cover_{orderId}.pdf
            const coverPdfPath = `book-mvp-simple-adventure/orders/${orderId}/cover_${orderId}.pdf`;
            // Try to get a preview image URL first (if workflow 3 generates one)
            const coverPreviewPath = `book-mvp-simple-adventure/orders/${orderId}/preview-images/cover_preview.png`;
            const coverPreviewUrl = `/api/assets/${coverPreviewPath}`;
            
            // Check if cover preview exists, otherwise convert PDF to image
            fetch(coverPreviewUrl, { method: 'HEAD' })
              .then(async res => {
                if (res.ok) {
                  setCoverImageUrl(coverPreviewUrl);
                  setCoverImageLoading(false);
                } else {
                  // Convert PDF to image using PDF.js
                  const coverPdfUrl = `/api/pdf/${coverPdfPath}`;
                  try {
                    const dataUrl = await convertPdfToImage(coverPdfUrl);
                    setCoverImageDataUrl(dataUrl);
                    setCoverImageUrl(coverPdfUrl); // Keep PDF URL for reference
                    setCoverImageLoading(false);
                  } catch (pdfError) {
                    console.error('[Pages] Failed to convert cover PDF to image:', pdfError);
                    setCoverImageLoading(false);
                  }
                }
              })
              .catch(async () => {
                // Fallback: try to convert PDF to image
                const coverPdfUrl = `/api/pdf/${coverPdfPath}`;
                try {
                  const dataUrl = await convertPdfToImage(coverPdfUrl);
                  setCoverImageDataUrl(dataUrl);
                  setCoverImageUrl(coverPdfUrl);
                  setCoverImageLoading(false);
                } catch (pdfError) {
                  console.error('[Pages] Failed to convert cover PDF to image:', pdfError);
                  setCoverImageLoading(false);
                }
              });
          } catch (e) {
            console.log('[Pages] Cover image not available:', e);
            setCoverImageLoading(false);
          }
        }
        
        // Check if pages have actually changed to prevent unnecessary re-renders
        const currentPagesData = JSON.stringify(pageData);
        const pagesChanged = currentPagesData !== lastPagesDataRef.current;
        const isInitialLoad = lastPagesDataRef.current === '';
        
        // Determine which cover URL to use (prefer data URL from PDF conversion, fallback to image URL)
        const effectiveCoverUrl = coverImageDataUrl || coverImageUrl || undefined;
        
        // Only update state if pages have actually changed (not just cover state)
        // This prevents re-renders when cover loads but pages haven't changed
        if (pagesChanged || isInitialLoad) {
          const newSpreads = createSpreads(pageData, effectiveCoverUrl);
          
          // Update pages first
          setPages(pageData);
          
          // Update spreads
          setSpreads(newSpreads);
          
          // Store the current pages data to prevent re-renders
          lastPagesDataRef.current = currentPagesData;
          
          // Always start at the first spread (index 0) when pages are first loaded
          // This ensures we start with the first available page, not blank placeholders
          if (isInitialLoad) {
            // First time loading pages - always start at first spread
            setCurrentSpreadIndex(0);
          } else {
            // Refreshing pages - preserve current spread index, but clamp to valid range
            const maxIndex = newSpreads.length > 0 ? newSpreads.length - 1 : 0;
            setCurrentSpreadIndex((prevIndex) => Math.min(prevIndex, maxIndex));
          }
          
          // Only set loading to false when pages actually change
          // This prevents the loading state from being reset when cover loads separately
          setLoadingPages(false);
        } else {
          // Pages haven't changed, but cover might have - update spreads only if cover changed
          // This allows cover to appear without re-rendering pages or resetting loading state
          if (effectiveCoverUrl) {
            const newSpreads = createSpreads(pageData, effectiveCoverUrl);
            setSpreads(newSpreads);
          }
        }
        
        // If we found images in the manifest, stop polling
        if (foundInManifest && pageData.length > 0) {
          imagesFoundRef.current = true;
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
            console.log('[Pages] Images found in manifest, stopping auto-refresh');
          }
        }
        
        // Check if PDF exists for download
        try {
          const pdfRes = await fetch(pdfUrl, { method: 'HEAD' });
          if (pdfRes.ok) {
            const jsonRes = await fetch(`${pdfUrl}?format=json`);
            if (jsonRes.ok) {
              const data = await jsonRes.json();
              setPdfAsset(prev => ({
                ...prev,
                url: data.signedUrl || pdfUrl,
                exists: true,
                loading: false,
                error: null
              }));
            }
          } else {
            setPdfAsset(prev => ({
              ...prev,
              exists: false,
              loading: false,
              error: 'PDF not yet generated'
            }));
          }
        } catch (e) {
          console.error('[Pages] Error checking PDF:', e);
        }
      } catch (error: any) {
        if (!isMounted) return;
        console.error('[Pages] Error loading pages:', error);
        setPagesError(error?.message || 'Failed to load pages');
        setLoadingPages(false);
      }
    };

    loadPages();

    // Start polling - will stop automatically once images are found
    // Only poll if images haven't been found yet
    if (!imagesFoundRef.current) {
      intervalId = setInterval(() => {
        // Double-check ref before polling
        if (!imagesFoundRef.current && isMounted) {
          loadPages();
        } else if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }, 10000);
    }

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
  }, [orderId, pdfUrl]); // Removed coverImageUrl and coverImageDataUrl to prevent reload loops

  // Reset image loading state when spread changes
  useEffect(() => {
    const currentSpread = spreads[currentSpreadIndex];
    // Set loading to true if there's a page or cover to load
    setImageLoading({ 
      left: (currentSpread?.leftPage || (currentSpread?.coverData && currentSpread.coverData.isBackCover)) ? true : false, 
      right: (currentSpread?.rightPage || (currentSpread?.coverData && currentSpread.coverData.isFrontCover)) ? true : false 
    });
    setImageError({ left: null, right: null });
  }, [currentSpreadIndex, spreads]);

  const handleDownload = () => {
    if (pdfAsset.exists && pdfAsset.url) {
      const link = document.createElement('a');
      link.href = pdfAsset.url;
      link.download = `complete_book_${orderId}.pdf`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleFlag = () => {
    setPdfAsset(prev => ({ ...prev, isFlagged: !prev.isFlagged }));
  };

  useEffect(() => {
    setFlaggedCount(orderId, 'postPdf', pdfAsset.isFlagged ? 1 : 0);
  }, [orderId, pdfAsset.isFlagged]);

  const isPostBriaApproved = order.reviewStages.postBria.status === 'approved';
  const canApprove = !pdfAsset.isFlagged && isPostBriaApproved;

  const currentSpread = spreads[currentSpreadIndex];
  const totalSpreads = spreads.length;
  const currentSpreadNumber = currentSpreadIndex + 1;

  const handlePreviousSpread = () => {
    if (currentSpreadIndex > 0) {
      setCurrentSpreadIndex(currentSpreadIndex - 1);
    }
  };

  const handleNextSpread = () => {
    if (currentSpreadIndex < totalSpreads - 1) {
      setCurrentSpreadIndex(currentSpreadIndex + 1);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentSpreadIndex > 0) {
        setCurrentSpreadIndex(currentSpreadIndex - 1);
      } else if (e.key === 'ArrowRight' && currentSpreadIndex < totalSpreads - 1) {
        setCurrentSpreadIndex(currentSpreadIndex + 1);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentSpreadIndex, totalSpreads]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .spread-container {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          width: 100%;
        }

        .two-page-spread {
          display: flex;
          gap: 0; /* No gap between pages in print */
          width: 100%;
          max-width: 100%;
          height: auto;
        }

        .two-page-spread img {
          width: 50%;
          height: auto;
          object-fit: contain;
          display: block;
          aspect-ratio: 1 / 1;
        }

        .white-page {
          width: 50%;
          aspect-ratio: 1 / 1;
          background-color: white;
          /* Simulated white page - no image needed */
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
        }

        .cover-image-container.front-cover img {
          object-position: right center;
        }

        .cover-image-container.back-cover img {
          object-position: left center;
        }
      `}} />
    <div className="space-y-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Final Compiled PDF</h3>
            <p className="text-sm text-gray-600 mt-1">
              Review the complete personalized book before final approval
            </p>
            {pdfAsset.isFlagged && (
              <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                <Flag className="h-3 w-3 mr-1" />
                Needs Attention
              </div>
            )}
          </div>
          
          <div className="flex space-x-3">
            {pdfAsset.exists && (
            <button
              onClick={handleDownload}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </button>
            )}
            <button
              onClick={handleFlag}
              className={`inline-flex items-center px-4 py-2 border rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                pdfAsset.isFlagged
                  ? 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100 focus:ring-red-500'
                  : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50 focus:ring-blue-500'
              }`}
            >
              <Flag className="h-4 w-4 mr-2" />
              {pdfAsset.isFlagged ? 'Unflag' : 'Flag for Review'}
            </button>
          </div>
        </div>

        {/* PDF Viewer - Page Preview */}
        {loadingPages && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="h-[800px] bg-gray-50 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Loading book pages...</p>
              </div>
            </div>
          </div>
        )}

        {pagesError && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="h-[800px] bg-gray-50 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                <p className="text-red-600 text-sm font-medium">{pagesError}</p>
              </div>
            </div>
          </div>
        )}

        {!loadingPages && !pagesError && pages.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="h-[800px] bg-gray-50 flex items-center justify-center">
              <div className="text-center max-w-md">
                <Loader2 className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 mb-2">Preview Images Pending</h4>
                <p className="text-gray-600 text-sm mb-4">
                  Book preview images will appear here automatically once Workflow 3 (Book Assembly) completes.
                </p>
                <p className="text-gray-500 text-xs">
                  This page will refresh automatically every 10 seconds.
                </p>
              </div>
            </div>
          </div>
        )}

        {!loadingPages && !pagesError && spreads.length > 0 && currentSpread && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            {/* Viewer Header */}
            <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  Spread {currentSpreadNumber} of {totalSpreads}
                  {currentSpread.isCover && (
                    <span className="text-gray-500 ml-2">(Front Cover)</span>
                  )}
                  {currentSpread.isBackCover && (
                    <span className="text-gray-500 ml-2">(Back Cover)</span>
                  )}
                  {!currentSpread.isCover && !currentSpread.isBackCover && currentSpread.leftPage && currentSpread.rightPage && (
                    <span className="text-gray-500 ml-2">
                      (Pages {currentSpread.leftPage.pageNumber} & {currentSpread.rightPage.pageNumber})
                    </span>
                  )}
                  {!currentSpread.isCover && !currentSpread.isBackCover && currentSpread.leftPage && !currentSpread.rightPage && (
                    <span className="text-gray-500 ml-2">
                      (Page {currentSpread.leftPage.pageNumber})
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePreviousSpread}
                    disabled={currentSpreadIndex === 0}
                    className="p-2 rounded-md hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Previous spread"
                  >
                    <ChevronLeft className="h-5 w-5 text-gray-600" />
                  </button>
                  <button
                    onClick={handleNextSpread}
                    disabled={currentSpreadIndex >= totalSpreads - 1}
                    className="p-2 rounded-md hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Next spread"
                  >
                    <ChevronRight className="h-5 w-5 text-gray-600" />
                  </button>
                </div>
              </div>
            </div>

            {/* Spread Display Area */}
            <div className="bg-gray-100 flex items-center justify-center p-8 relative">
              {((currentSpread.leftPage || (currentSpread.coverData && currentSpread.coverData.isBackCover)) && imageLoading.left) || 
                ((currentSpread.rightPage || (currentSpread.coverData && currentSpread.coverData.isFrontCover)) && imageLoading.right) ? (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                      <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                    </div>
                  ) : null}
                  
              {(imageError.left || imageError.right) && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                      <div className="text-center">
                        <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                    <p className="text-red-600 text-sm">
                      {imageError.left || imageError.right}
                    </p>
                      </div>
                    </div>
                  )}

              <div className="spread-container w-full max-w-full">
                <div className="two-page-spread">
                  {/* Left page - can be regular page or back cover */}
                  {currentSpread.coverData && currentSpread.coverData.isBackCover ? (
                    // Back cover: show left half of cover image
                    <div className="cover-image-container back-cover">
                      <img
                        src={currentSpread.coverData.fullImageUrl}
                        alt="Back Cover"
                        onLoad={() => {
                          console.log('[Spreads] ✓ Back cover image loaded successfully');
                          setImageLoading(prev => ({ ...prev, left: false }));
                          setImageError(prev => ({ ...prev, left: null }));
                        }}
                        onError={(e) => {
                          console.error('[Spreads] ✗ Back cover image failed to load:', e);
                          setImageLoading(prev => ({ ...prev, left: false }));
                          setImageError(prev => ({ ...prev, left: 'Failed to load back cover' }));
                        }}
                        className={`transition-opacity duration-200 ${
                          imageLoading.left ? 'opacity-0' : 'opacity-100'
                        }`}
                        style={{
                          display: imageError.left ? 'none' : 'block'
                        }}
                      />
                    </div>
                  ) : currentSpread.leftPage ? (
                    <img
                      src={currentSpread.leftPage.previewImageUrl}
                      alt={`Page ${currentSpread.leftPage.pageNumber}`}
                      onLoad={() => {
                        console.log(`[Spreads] ✓ Left image loaded successfully for page ${currentSpread.leftPage!.pageNumber}`);
                        setImageLoading(prev => ({ ...prev, left: false }));
                        setImageError(prev => ({ ...prev, left: null }));
                      }}
                      onError={async (e) => {
                        const img = e.currentTarget;
                        const url = currentSpread.leftPage!.previewImageUrl;
                        
                        try {
                          const response = await fetch(url, { method: 'HEAD' });
                          console.error(`[Spreads] ✗ Left image failed to load for page ${currentSpread.leftPage!.pageNumber}:`, {
                            url,
                            httpStatus: response.status,
                            httpStatusText: response.statusText,
                            error: e
                          });
                        } catch (fetchError) {
                          console.error(`[Spreads] ✗ Left image fetch error for page ${currentSpread.leftPage!.pageNumber}:`, {
                            url,
                            fetchError,
                            error: e
                          });
                        }
                        
                        setImageLoading(prev => ({ ...prev, left: false }));
                        setImageError(prev => ({ ...prev, left: `Failed to load page ${currentSpread.leftPage!.pageNumber}` }));
                      }}
                      className={`transition-opacity duration-200 ${
                        imageLoading.left ? 'opacity-0' : 'opacity-100'
                      }`}
                      style={{
                        display: imageError.left ? 'none' : 'block'
                      }}
                    />
                  ) : (
                    <div className="white-page" />
                  )}
                  
                  {/* Right page - can be regular page or front cover */}
                  {currentSpread.coverData && currentSpread.coverData.isFrontCover ? (
                    // Front cover: show right half of cover image
                    <div className="cover-image-container front-cover">
                      <img
                        src={currentSpread.coverData.fullImageUrl}
                        alt="Front Cover"
                        onLoad={() => {
                          console.log('[Spreads] ✓ Front cover image loaded successfully');
                          setImageLoading(prev => ({ ...prev, right: false }));
                          setImageError(prev => ({ ...prev, right: null }));
                        }}
                        onError={(e) => {
                          console.error('[Spreads] ✗ Front cover image failed to load:', e);
                          setImageLoading(prev => ({ ...prev, right: false }));
                          setImageError(prev => ({ ...prev, right: 'Failed to load front cover' }));
                        }}
                        className={`transition-opacity duration-200 ${
                          imageLoading.right ? 'opacity-0' : 'opacity-100'
                        }`}
                        style={{
                          display: imageError.right ? 'none' : 'block'
                        }}
                      />
                    </div>
                  ) : currentSpread.rightPage ? (
                    <img
                      src={currentSpread.rightPage.previewImageUrl}
                      alt={`Page ${currentSpread.rightPage.pageNumber}`}
                    onLoad={() => {
                        console.log(`[Spreads] ✓ Right image loaded successfully for page ${currentSpread.rightPage!.pageNumber}`);
                        setImageLoading(prev => ({ ...prev, right: false }));
                        setImageError(prev => ({ ...prev, right: null }));
                    }}
                    onError={async (e) => {
                      const img = e.currentTarget;
                        const url = currentSpread.rightPage!.previewImageUrl;
                      
                      try {
                        const response = await fetch(url, { method: 'HEAD' });
                          console.error(`[Spreads] ✗ Right image failed to load for page ${currentSpread.rightPage!.pageNumber}:`, {
                          url,
                          httpStatus: response.status,
                          httpStatusText: response.statusText,
                          error: e
                        });
                      } catch (fetchError) {
                          console.error(`[Spreads] ✗ Right image fetch error for page ${currentSpread.rightPage!.pageNumber}:`, {
                          url,
                          fetchError,
                          error: e
                        });
                      }
                      
                        setImageLoading(prev => ({ ...prev, right: false }));
                        setImageError(prev => ({ ...prev, right: `Failed to load page ${currentSpread.rightPage!.pageNumber}` }));
                    }}
                      className={`transition-opacity duration-200 ${
                        imageLoading.right ? 'opacity-0' : 'opacity-100'
                    }`}
                    style={{
                        display: imageError.right ? 'none' : 'block'
                    }}
                  />
                  ) : (
                    <div className="white-page" />
              )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PDF Info */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">File Size:</span>
              <span className="ml-1 text-gray-900">219 MB</span>
            </div>
            <div>
              <span className="text-gray-500">Pages:</span>
              <span className="ml-1 text-gray-900">{pages.length || 14}</span>
            </div>
            <div>
              <span className="text-gray-500">Format:</span>
              <span className="ml-1 text-gray-900">8×10 Softcover</span>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>
              <span className="ml-1 text-gray-900">
                {pdfAsset.isFlagged ? 'Needs Review' : 'Ready'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 rounded-lg p-6">
        <h4 className="text-sm font-medium text-blue-900 mb-3">Final Review Checklist</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <h5 className="font-medium mb-2">Content Review</h5>
            <ul className="space-y-1">
              <li>• All pages are present and in correct order</li>
              <li>• Character appears consistently across all pages</li>
              <li>• Text is properly formatted and readable</li>
              <li>• Child's name appears correctly throughout</li>
            </ul>
          </div>
          <div>
            <h5 className="font-medium mb-2">Technical Review</h5>
            <ul className="space-y-1">
              <li>• Images are high quality and properly positioned</li>
              <li>• No layout issues or text overflow</li>
              <li>• Print margins are correct for 8×10 format</li>
              <li>• PDF is optimized for print production</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-lg font-medium text-gray-900">Final Approval</h4>
            <p className="text-sm text-gray-600 mt-1">
              {isApproved 
                ? 'This order has been fully approved and is ready for production.'
                : !isPostBriaApproved
                ? 'The Post-Bria stage must be approved before final PDF review can begin.'
                : pdfAsset.isFlagged
                ? 'Please address the flagged issues before final approval.'
                : 'Review the compiled PDF and approve when ready for production.'
              }
            </p>
          </div>
          
          <div className="flex space-x-3">
            {isApproved ? (
              <button
                onClick={onInitiateWorkflow}
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <Play className="h-4 w-4 mr-2" />
                Send to Production
              </button>
            ) : (
              <button
                onClick={onApprove}
                disabled={!canApprove}
                className={`inline-flex items-center px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  !canApprove
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                }`}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Final Approval
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
