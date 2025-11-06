'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Play, Download, Flag, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { setFlaggedCount } from '@/lib/review-state';
import { Order } from '@/types/order';

interface PostPdfStageProps {
  orderId: string;
  order: Order;
  isApproved: boolean;
  onApprove: () => void;
  onInitiateWorkflow: () => void;
}

interface PageData {
  pageNumber: number;
  // Preview image mode (when available)
  previewImageUrl?: string;
  // Reconstruction mode (fallback)
  backgroundUrl?: string;
  characterUrl?: string | null;
  animalUrl?: string | null;
  text?: string;
  textBoxOverlayUrl?: string;
}

// Note: Page reconstruction logic removed - now using preview images from Workflow 3's 3-manifest


export function PostPdfStage({ orderId, order, isApproved, onApprove, onInitiateWorkflow }: PostPdfStageProps) {
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
  const [pageNumber, setPageNumber] = useState(1);
  const [loadingPages, setLoadingPages] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);

  const pdfPath = `book-mvp-simple-adventure/orders/${orderId}/complete_book_${orderId}.pdf`;
  const pdfUrl = `/api/pdf/${pdfPath}`;
  const backendUrl = typeof window !== 'undefined' ? window.location.origin : 'https://admin.littleherolabs.com';

  // Check if PDF exists and load page data from 2B manifest
  useEffect(() => {
    let isMounted = true;

    const loadPages = async () => {
      if (!isMounted) return;

      setLoadingPages(true);
      setPagesError(null);

      try {
        // Try 3-manifest first (has preview images)
        const manifest3Key = `book-mvp-simple-adventure/orders/${orderId}/manifests/3-manifest.json`;
        const manifest3Url = `${backendUrl}/api/manifests/${manifest3Key}`;
        
        console.log('[Pages] Trying 3-manifest first:', manifest3Url);
        let usingPreviewImages = false;
        
        try {
          const manifest3Res = await fetch(manifest3Url);
          console.log('[Pages] 3-manifest response:', {
            status: manifest3Res.status,
            ok: manifest3Res.ok,
            url: manifest3Url
          });
          
          if (manifest3Res.ok) {
            const manifest3 = await manifest3Res.json();
            console.log('[Pages] 3-manifest loaded:', {
              hasBookAssembly: !!manifest3?.bookAssembly,
              hasPagePreviewImages: !!manifest3?.bookAssembly?.pagePreviewImages,
              previewImagesCount: manifest3?.bookAssembly?.pagePreviewImages?.length || 0,
              bookAssemblyKeys: manifest3?.bookAssembly ? Object.keys(manifest3.bookAssembly) : [],
              previewImagesType: Array.isArray(manifest3?.bookAssembly?.pagePreviewImages) ? 'array' : typeof manifest3?.bookAssembly?.pagePreviewImages,
              firstPreviewImage: manifest3?.bookAssembly?.pagePreviewImages?.[0] || null
            });
            
            const previewImages = manifest3?.bookAssembly?.pagePreviewImages;
            
            // Log the actual structure for debugging
            if (previewImages) {
              console.log('[Pages] Preview images structure:', {
                isArray: Array.isArray(previewImages),
                length: Array.isArray(previewImages) ? previewImages.length : 'N/A',
                type: typeof previewImages,
                firstItem: Array.isArray(previewImages) && previewImages.length > 0 ? previewImages[0] : null,
                allItems: Array.isArray(previewImages) ? previewImages : null
              });
            }
            
            if (previewImages && Array.isArray(previewImages) && previewImages.length > 0) {
              console.log('[Pages] ✓ Using preview images from 3-manifest:', {
                imageCount: previewImages.length,
                firstPage: previewImages[0]?.pageNumber,
                firstImageUrl: previewImages[0]?.imageUrl
              });
              
              // Use preview images directly
              const pageData = previewImages
                .sort((a, b) => a.pageNumber - b.pageNumber)
                .map((img: any) => ({
                  pageNumber: img.pageNumber,
                  previewImageUrl: img.imageUrl
                }));
              
              if (!isMounted) return;
              
              setPages(pageData);
              setLoadingPages(false);
              usingPreviewImages = true;
              
              // Also check if PDF exists for download
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
              
              return; // Success with preview images, exit early
            } else {
              console.log('[Pages] 3-manifest found but pagePreviewImages array is empty or missing');
            }
          } else {
            console.log('[Pages] 3-manifest not found (status:', manifest3Res.status, '), falling back to 2B reconstruction');
          }
        } catch (e) {
          console.log('[Pages] 3-manifest fetch error:', e);
        }
        
        // No fallback reconstruction - show waiting message
        if (!usingPreviewImages) {
          console.log('[Pages] 3-manifest not available yet. Preview images will appear once Workflow 3 completes.');
          
          if (!isMounted) return;
          
          setPages([]);
          setLoadingPages(false);
          setPagesError(null); // Clear error so we show the waiting message
          
          // Still check if PDF exists for download (even if preview images aren't ready)
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
        }
      } catch (error: any) {
        if (!isMounted) return;
        console.error('[Pages] Error loading pages:', {
          error,
          message: error?.message,
          stack: error?.stack,
          name: error?.name
        });
        setPagesError(error?.message || 'Failed to load pages');
        setLoadingPages(false);
        setPdfAsset(prev => ({
          ...prev,
          loading: false,
          error: error?.message || 'Failed to load preview'
        }));
      }
    };

    loadPages();

    const interval = setInterval(() => {
      loadPages();
    }, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [orderId, pdfUrl, backendUrl]);

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

  const currentPage = pages[pageNumber - 1];
  const totalPages = pages.length;

  // Debug logging
  useEffect(() => {
    console.log('[Pages] Render state:', {
      loadingPages,
      pagesError,
      pagesLength: pages.length,
      pageNumber,
      currentPage: currentPage ? {
        pageNumber: currentPage.pageNumber,
        hasPreviewImage: !!currentPage.previewImageUrl,
        hasBackground: !!currentPage.backgroundUrl,
        hasCharacter: !!currentPage.characterUrl,
        hasText: !!currentPage.text,
        mode: currentPage.previewImageUrl ? 'PREVIEW_IMAGE' : 'RECONSTRUCTION'
      } : null,
      totalPages
    });
  }, [loadingPages, pagesError, pages.length, pageNumber, currentPage, totalPages]);

  return (
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

        {/* Page Preview */}
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
                <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">{pagesError}</p>
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
                  This page will refresh automatically every 10 seconds. Preview images are generated from the final book layout.
                </p>
              </div>
            </div>
          </div>
        )}

        {!loadingPages && !pagesError && currentPage && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Page {pageNumber} of {totalPages}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPageNumber(prev => Math.max(1, prev - 1))}
                    disabled={pageNumber <= 1}
                    className="p-1.5 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPageNumber(prev => Math.min(totalPages, prev + 1))}
                    disabled={pageNumber >= totalPages}
                    className="p-1.5 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="h-[800px] bg-gray-100 overflow-hidden flex items-center justify-center p-4" style={{ position: 'relative' }}>
              {/* Preview image mode (from 3-manifest) */}
              {currentPage?.previewImageUrl && (
                <div
                  className="book-page relative"
                  id={`page-${currentPage.pageNumber}`}
                  style={{
                    width: '2550px',
                    height: '2550px',
                    transform: 'scale(0.3)',
                    transformOrigin: 'center center',
                    margin: '0 auto',
                    position: 'relative',
                    backgroundColor: '#fff',
                    overflow: 'hidden',
                    boxSizing: 'border-box'
                  }}
                >
                  <img
                    src={currentPage.previewImageUrl}
                    alt={`Page ${currentPage.pageNumber}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      display: 'block'
                    }}
                  />
                </div>
              )}
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
              <span className="ml-1 text-gray-900">{totalPages || 14}</span>
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
  );
}
