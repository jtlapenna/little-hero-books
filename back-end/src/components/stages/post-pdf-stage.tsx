'use client';

import { useEffect, useState, useMemo } from 'react';
import { CheckCircle, Play, Download, Flag, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { setFlaggedCount } from '@/lib/review-state';
import { Order } from '@/types/order';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker - use local worker file (most reliable, no CDN issues)
// Worker file is copied from node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs to public/
if (typeof window !== 'undefined') {
  // Use local worker file - avoids CORS and CDN issues
  const localWorkerUrl = '/pdf.worker.min.mjs';
  // Fallback to CDN if local file doesn't exist (shouldn't happen in production)
  const cdnWorkerUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
  
  // Prefer local worker, fallback to CDN
  pdfjs.GlobalWorkerOptions.workerSrc = localWorkerUrl;
  
  console.log('[PDF] Worker configured:', {
    version: pdfjs.version,
    localWorkerUrl,
    fallbackWorkerUrl: cdnWorkerUrl,
    workerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
    note: 'Using local worker file to avoid CORS/CDN issues'
  });
  
  // Verify local worker file exists (non-blocking check)
  fetch(localWorkerUrl, { method: 'HEAD' })
    .then(response => {
      if (response.ok) {
        console.log('[PDF] Local worker file is accessible:', localWorkerUrl);
      } else {
        console.warn('[PDF] Local worker file not found, switching to CDN fallback:', response.status);
        pdfjs.GlobalWorkerOptions.workerSrc = cdnWorkerUrl;
        console.log('[PDF] Switched to CDN worker:', cdnWorkerUrl);
      }
    })
    .catch(error => {
      console.warn('[PDF] Local worker check failed, using CDN fallback:', error);
      pdfjs.GlobalWorkerOptions.workerSrc = cdnWorkerUrl;
      console.log('[PDF] Switched to CDN worker:', cdnWorkerUrl);
    });
}

interface PostPdfStageProps {
  orderId: string;
  order: Order;
  isApproved: boolean;
  onApprove: () => void;
  onInitiateWorkflow: () => void;
}

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

  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  // Construct PDF path: book-mvp-simple-adventure/orders/{orderId}/complete_book_{orderId}.pdf
  const pdfPath = `book-mvp-simple-adventure/orders/${orderId}/complete_book_${orderId}.pdf`;
  const pdfUrl = `/api/pdf/${pdfPath}`;

  // Check if PDF exists when component mounts or orderId changes
  useEffect(() => {
    let isMounted = true;
    
    const checkPdfExists = async () => {
      if (!isMounted) return;
      
      console.log('[PDF] Checking PDF existence:', { orderId, pdfPath, pdfUrl });
      setPdfAsset(prev => ({ ...prev, loading: true, error: null }));
      
      try {
        console.log('[PDF] Sending HEAD request to:', pdfUrl);
        const response = await fetch(pdfUrl, { method: 'HEAD' });
        
        console.log('[PDF] HEAD response:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries())
        });
        
        if (!isMounted) return;
        
        if (response.ok) {
          console.log('[PDF] PDF exists, fetching and converting to blob URL');
          setPdfAsset(prev => ({
            ...prev,
            url: pdfUrl,
            exists: true,
            loading: false,
            error: null
          }));
          
          // Fetch signed URL from backend (avoids streaming limits for large PDFs)
          try {
            // Add cache-busting query parameter to prevent stale responses
            const cacheBustUrl = `${pdfUrl}?format=json&_t=${Date.now()}`;
            console.log('[PDF] Fetching signed URL from:', cacheBustUrl);
            
            const response = await fetch(cacheBustUrl, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
              },
              cache: 'no-store', // Prevent browser caching
            });
            
            if (!isMounted) {
              console.log('[PDF] Component unmounted during fetch, aborting');
              return;
            }
            
            if (!response.ok) {
              throw new Error(`Failed to get signed URL: ${response.status} ${response.statusText}`);
            }
            
            // Validate Content-Type before parsing JSON
            const contentType = response.headers.get('Content-Type') || '';
            console.log('[PDF] Response headers:', {
              contentType,
              status: response.status,
              statusText: response.statusText,
              url: response.url,
              headers: Object.fromEntries(response.headers.entries())
            });
            
            if (!contentType.includes('application/json')) {
              // If we got PDF data instead of JSON, log full error
              const textPreview = await response.clone().text().then(t => t.substring(0, 200)).catch(() => 'Unable to read response');
              console.error('[PDF] Expected JSON but got:', {
                contentType,
                preview: textPreview,
                isPdfHeader: textPreview.startsWith('%PDF')
              });
              throw new Error(`Expected JSON response but received ${contentType}. This may be a cached PDF response.`);
            }
            
            const data = await response.json();
            console.log('[PDF] Received signed URL response:', {
              hasSignedUrl: !!data.signedUrl,
              expiresIn: data.expiresIn,
              contentLength: data.contentLength,
              contentType: data.contentType,
              signedUrlPrefix: data.signedUrl ? data.signedUrl.substring(0, 50) + '...' : 'none',
              fullData: data
            });
            
            if (!data.signedUrl) {
              console.error('[PDF] No signed URL in response:', data);
              throw new Error('No signed URL in response');
            }
            
            // Validate signed URL format - must be R2 URL, not API endpoint
            const signedUrl = data.signedUrl;
            const isR2Url = signedUrl.includes('.r2.cloudflarestorage.com') || 
                           signedUrl.includes('.r2.dev') ||
                           signedUrl.includes('r2.cloudflarestorage.com');
            const isApiUrl = signedUrl.includes('/api/pdf/');
            
            console.log('[PDF] Validating signed URL:', {
              signedUrlPrefix: signedUrl.substring(0, 50) + '...',
              isR2Url,
              isApiUrl,
              urlLength: signedUrl.length
            });
            
            if (isApiUrl) {
              console.error('[PDF] Signed URL points to API endpoint instead of R2:', signedUrl);
              throw new Error('Invalid signed URL: points to API endpoint instead of R2 storage');
            }
            
            if (!isR2Url) {
              console.warn('[PDF] Signed URL does not appear to be R2 URL:', signedUrl.substring(0, 100));
            }
            
            // Store signed URL for download button
            // For now, we'll use download-only approach due to browser/Cloudflare limitations with 219MB files
            // The ERR_CACHE_WRITE_FAILURE suggests the browser can't handle such large streams
            console.log('[PDF] PDF is available for download (219MB file too large for browser preview)');
            
            if (!isMounted) {
              console.log('[PDF] Component unmounted before setting PDF state, aborting');
              return;
            }
            
            // Clean up previous blob URL if exists
            setPdfBlobUrl(prevBlobUrl => {
              if (prevBlobUrl) {
                console.log('[PDF] Revoking previous blob URL');
                URL.revokeObjectURL(prevBlobUrl);
              }
              return null;
            });
            
            // Store PDF URL for download - skip in-browser preview for now
            // The download button will use the signed URL directly
            setPdfAsset(prev => ({
              ...prev,
              url: signedUrl, // Use signed URL for download (bypasses backend proxy limits)
              exists: true,
              loading: false,
              error: null
            }));
            
            console.log('[PDF] PDF ready for download. In-browser preview disabled due to file size limits.');
          } catch (fetchError: any) {
            if (!isMounted) return;
            
            console.error('[PDF] Error fetching signed URL:', fetchError);
            setPdfError(fetchError?.message || 'Failed to load PDF');
            setPdfLoading(false);
          }
        } else {
          const errorMsg = response.status === 404 ? 'PDF not yet generated' : `Failed to load PDF: ${response.status} ${response.statusText}`;
          console.warn('[PDF] PDF check failed:', errorMsg);
          setPdfAsset(prev => ({
            ...prev,
            exists: false,
            loading: false,
            error: errorMsg
          }));
        }
      } catch (error: any) {
        if (!isMounted) return;
        
        console.error('[PDF] Error checking PDF existence:', {
          error,
          message: error?.message,
          stack: error?.stack,
          pdfUrl
        });
        setPdfAsset(prev => ({
          ...prev,
          exists: false,
          loading: false,
          error: error?.message || 'Error checking PDF availability'
        }));
      }
    };

    checkPdfExists();
    
    // Poll every 10 seconds if PDF doesn't exist yet (workflow might still be running)
    const interval = setInterval(() => {
      checkPdfExists();
    }, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [orderId, pdfUrl]);

  const handleDownload = () => {
    if (pdfAsset.exists && pdfAsset.url) {
      const link = document.createElement('a');
      link.href = pdfAsset.url;
      link.download = `complete_book_${orderId}.pdf`;
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

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        console.log('[PDF] Cleaning up blob URL');
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  // Memoize PDF file object - use signed URL directly (bypasses worker streaming limits)
  const pdfFile = useMemo(() => {
    if (!pdfAsset.exists) {
      console.log('[PDF] pdfFile memo: PDF does not exist');
      return null;
    }
    
    // Use signed URL directly (PDF.js can load from R2 signed URL)
    if (pdfAsset.url) {
      console.log('[PDF] pdfFile memo: using signed URL directly');
      return pdfAsset.url;
    }
    
    console.log('[PDF] pdfFile memo: no file available');
    return null;
  }, [pdfAsset.exists, pdfAsset.url]);

  return (
    <div className="space-y-8">
      {/* PDF Preview Section */}
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

        {/* PDF Preview - Auto-display when available */}
        {pdfAsset.loading && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="h-96 bg-gray-50 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Checking for PDF...</p>
              </div>
            </div>
          </div>
        )}

        {!pdfAsset.loading && !pdfAsset.exists && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="h-96 bg-gray-50 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">{pdfAsset.error || 'PDF not yet available'}</p>
                <p className="text-gray-400 text-xs mt-1">
                  The PDF will appear here automatically once Workflow 3 completes
                </p>
              </div>
            </div>
          </div>
        )}

            {!pdfAsset.loading && pdfAsset.exists && pdfAsset.url && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{pdfAsset.name}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDownload}
                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download PDF
                      </button>
                    </div>
                  </div>
                </div>
                <div className="h-[600px] bg-gray-50 flex items-center justify-center p-8">
                  <div className="text-center max-w-md">
                    <AlertCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">PDF Preview Unavailable</h3>
                    <p className="text-gray-600 text-sm mb-4">
                      This PDF file is 219MB, which exceeds browser limits for in-page preview. 
                      Please download the file to view it using your system's PDF viewer.
                    </p>
                    <p className="text-gray-500 text-xs mb-6">
                      The download button will open the PDF directly from secure storage.
                    </p>
                    <button
                      onClick={handleDownload}
                      className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-base font-medium"
                    >
                      <Download className="h-5 w-5 mr-2" />
                      Download PDF to View
                    </button>
                  </div>
                </div>
              </div>
            )}

        {/* PDF Info */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">File Size:</span>
              <span className="ml-1 text-gray-900">2.1 MB</span>
            </div>
            <div>
              <span className="text-gray-500">Pages:</span>
              <span className="ml-1 text-gray-900">14</span>
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

      {/* Quality Check Guidelines */}
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

      {/* Stage Actions */}
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
