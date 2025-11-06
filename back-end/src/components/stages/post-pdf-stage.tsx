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

// Page-to-pose mapping (same as Workflow 3)
const PAGE_TO_POSE_MAP: Record<number, number> = {
  1: 1,   // walking
  2: 2,   // walking-looking-higher
  3: 3,   // looking
  4: 4,   // floating
  5: 5,   // walking-looking-down
  6: 6,   // jogging
  7: 3,   // looking (reuse pose 3 from page 3)
  8: 7,   // sitting-eating
  9: 8,   // crouching
  10: 9,  // crawling-moving-happy
  11: 10, // surprised-looking-up
  12: 11, // surprised
  // 13: no character (animal only)
  14: 12  // flying/gliding
};

// Character positioning (same as Workflow 3)
const CHAR_POSITIONS: Record<number, { left: number; top: number; w: number; flip: number }> = {
  1: { left: 1453, top: 1938, w: 900, flip: 1 },
  2: { left: 1403, top: 2091, w: 950, flip: 1 },
  3: { left: 1020, top: 2142, w: 1100, flip: -1 },
  4: { left: 1530, top: 1734, w: 1100, flip: 1 },
  5: { left: 1250, top: 2066, w: 900, flip: -1 },
  6: { left: 1326, top: 2066, w: 900, flip: 1 },
  7: { left: 1199, top: 1683, w: 900, flip: -1 },
  8: { left: 1453, top: 2040, w: 1400, flip: 1 },
  9: { left: 1352, top: 2066, w: 1100, flip: -1 },
  10: { left: 1275, top: 2295, w: 1300, flip: -1 },
  11: { left: 1964, top: 2117, w: 500, flip: 1 },
  12: { left: 893, top: 2066, w: 920, flip: -1 },
  14: { left: 893, top: 1836, w: 1500, flip: 1 },
};

// Animal positions
const ANIMAL_POSITIONS = {
  13: { left: 1191, top: 2104, w: 1800 }, // appears
  14: { left: 1275, top: 1964, w: 1250 }, // flying
};

// Scene slugs for backgrounds
const SCENE_SLUGS = [
  'twilight-walk', 'night-forest', 'magic-doorway', 'courage-leap', 'morning-meadow',
  'tall-forest', 'mountain-vista', 'picnic-surprise', 'beach-discovery', 'crystal-cave',
  'giant-flowers', 'almost-there', 'animal-reveal', 'flying-home'
];

// Story text templates (same as Workflow 3)
function getStoryTexts(childName: string, hometown: string, animalDisplayName: string): string[] {
  return [
    `It was a nice evening in ${hometown}. ${childName} went outside.`,
    `${childName} looked at the stars.<br>You like to explore, the voice said.`,
    `There was a doorway! ${childName} walked through.`,
    `Stars were all around! ${childName} felt brave.`,
    `The path went through giant trees. ${childName} felt small, but not scared.`,
    `Look how far you came, the voice said.`,
    `Lunch was waiting! ${childName} ate happily.<br>You earned this, the voice said.`,
    `The path became warm sand. Look down there, the voice said.<br>${childName} found a beautiful shell!`,
    `${childName} found a cave with sparkly crystals! They glowed with rainbow colors. You can find beauty everywhere, the voice said.`,
    `The path went through giant flowers. The petals were SO big!<br>You make others happy, the voice said.`,
    `The voice felt very close now. You are perfect just as you are, it said.<br>${childName} looked around. Where was the voice?`,
    `${animalDisplayName} appeared!<br>It was the voice! I have been with you this whole time, said ${animalDisplayName}.`,
    `Ready to fly home? asked ${animalDisplayName}.<br>They flew through the stars to ${hometown}. I am always in your heart, said ${animalDisplayName}.`
  ];
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
          if (manifest3Res.ok) {
            const manifest3 = await manifest3Res.json();
            const previewImages = manifest3?.bookAssembly?.pagePreviewImages;
            
            if (previewImages && Array.isArray(previewImages) && previewImages.length > 0) {
              console.log('[Pages] Using preview images from 3-manifest:', {
                imageCount: previewImages.length,
                firstPage: previewImages[0]?.pageNumber
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
            }
          }
        } catch (e) {
          console.log('[Pages] 3-manifest not available, falling back to 2B reconstruction:', e);
        }
        
        // Fallback: Fetch 2B manifest and reconstruct pages
        if (!usingPreviewImages) {
          const manifestKey = `book-mvp-simple-adventure/orders/${orderId}/manifests/2b-manifest.json`;
          const manifestUrl = `${backendUrl}/api/manifests/${manifestKey}`;

          console.log('[Pages] Fetching 2B manifest for reconstruction:', manifestUrl);
          const manifestRes = await fetch(manifestUrl);
          
          console.log('[Pages] Manifest response:', {
            status: manifestRes.status,
            ok: manifestRes.ok,
            contentType: manifestRes.headers.get('content-type')
          });
          
          if (!manifestRes.ok) {
            const errorText = await manifestRes.text().catch(() => 'Unable to read error');
            console.error('[Pages] Manifest fetch failed:', {
              status: manifestRes.status,
              statusText: manifestRes.statusText,
              error: errorText
            });
            throw new Error(`Failed to fetch manifest: ${manifestRes.status} ${manifestRes.statusText}`);
          }
          
          const manifest = await manifestRes.json();
          console.log('[Pages] Manifest loaded:', {
            hasOrder: !!manifest.order,
            hasEntries: Array.isArray(manifest.entries),
            entriesCount: manifest.entries?.length || 0,
            characterHash: manifest.characterHash || manifest.order?.characterHash
          });

          const { order: orderData, entries } = manifest || {};
          const characterHash = manifest?.characterHash || orderData?.characterHash;
          const characterSpecs = orderData?.characterSpecs || {};
          const childName = characterSpecs.childName || 'Child';
          const hometown = characterSpecs.hometown || 'Seattle';

          // Get animal guide - match Workflow 3 normalization
          const rawAnimalInput = String(characterSpecs.animalGuide || 'tiger');
          const cleaned = rawAnimalInput
            .replace(/[^a-z0-9\s-]/gi, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          
          const ALIAS_TO_SLUG: Record<string, string> = {
            'dog': 'dog',
            'cat': 'cat',
            't rex': 't-rex',
            'trex': 't-rex',
            't-rex': 't-rex',
            'unicorn': 'unicorn',
            'tiger': 'tiger',
            'lion': 'lion',
            'owl': 'owl',
          };
          
          const SLUG_TO_DISPLAY: Record<string, string> = {
            'dog': 'Dog',
            'cat': 'Cat',
            't-rex': 'T-Rex',
            'unicorn': 'Unicorn',
            'tiger': 'Tiger',
            'lion': 'Lion',
            'owl': 'Owl',
          };
          
          const animalSlug = ALIAS_TO_SLUG[cleaned] || 'tiger';
          const animalDisplayName = SLUG_TO_DISPLAY[animalSlug] || 'Tiger';

          // Build processed images from manifest entries
          const processedImages = (entries || [])
            .filter((e: any) => Number.isFinite(Number(e.poseNumber)) && e.bgRemovedKey)
            .sort((a: any, b: any) => a.poseNumber - b.poseNumber)
            .map((e: any) => ({
              poseNumber: e.poseNumber,
              imagePath: `${backendUrl}/api/assets/${e.bgRemovedKey}`
            }));

          // Build character images map
          const characterImages: Record<number, string> = {};
          processedImages.forEach((img: any) => {
            characterImages[img.poseNumber] = img.imagePath;
          });

          // Build animal images - match Workflow 3 path structure
          const animalImages = {
            appears: `${backendUrl}/api/assets/book-mvp-simple-adventure/characters/animals/${animalSlug}-appears.png`,
            flying: `${backendUrl}/api/assets/book-mvp-simple-adventure/characters/animals/${animalSlug}-flying.png`
          };

          // Text box overlay URL
          const textBoxOverlayUrl = `${backendUrl}/api/assets/book-mvp-simple-adventure/overlays/text-boxes/standard-box.png`;

          // Get story texts
          const storyTexts = getStoryTexts(childName, hometown, animalDisplayName);

          // Build page data
          const pageData: PageData[] = [];
          for (let i = 1; i <= 14; i++) {
            const backgroundUrl = `${backendUrl}/api/assets/book-mvp-simple-adventure/backgrounds/page${String(i).padStart(2, '0')}-${SCENE_SLUGS[i - 1]}.png`;
            
            // Get character image for this page
            const requiredPoseNumber = PAGE_TO_POSE_MAP[i];
            const characterUrl = requiredPoseNumber ? characterImages[requiredPoseNumber] || null : null;

            // Get animal image for this page
            let animalUrl: string | null = null;
            if (i === 13) {
              animalUrl = animalImages.appears;
            } else if (i === 14) {
              animalUrl = animalImages.flying;
            }

            pageData.push({
              pageNumber: i,
              backgroundUrl,
              characterUrl,
              animalUrl,
              text: storyTexts[i - 1] || '',
              textBoxOverlayUrl
            });
          }

          if (!isMounted) return;

          console.log('[Pages] Built page data (reconstruction mode):', {
            pageCount: pageData.length,
            firstPage: pageData[0] ? {
              pageNumber: pageData[0].pageNumber,
              hasBackground: !!pageData[0].backgroundUrl,
              hasCharacter: !!pageData[0].characterUrl,
              hasText: !!pageData[0].text,
              textLength: pageData[0].text?.length || 0
            } : null
          });

          setPages(pageData);
          setLoadingPages(false);

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
        hasBackground: !!currentPage.backgroundUrl,
        hasCharacter: !!currentPage.characterUrl,
        hasText: !!currentPage.text
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
              {/* Preview image mode (when available) */}
              {currentPage.previewImageUrl ? (
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
              ) : (
                /* Reconstruction mode (fallback) */
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
                  {/* Background - matches Workflow 3: <div class="page-bg" style="background-image:url('...')"></div> */}
                  {currentPage.backgroundUrl && (
                    <div
                      className="page-bg absolute inset-0"
                      style={{
                        backgroundImage: `url(${currentPage.backgroundUrl})`,
                        backgroundSize: '2550px 2550px',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat'
                      }}
                    />
                  )}

                  {/* Text Box - matches Workflow 3 exactly */}
                  {currentPage.textBoxOverlayUrl && currentPage.text && (
                    <div
                      className="text-box absolute"
                      style={{
                        left: '50%',
                        bottom: '3%',
                        width: '80%',
                        minHeight: '360px',
                        transform: 'translateX(-50%)',
                        backgroundImage: `url(${currentPage.textBoxOverlayUrl})`,
                        backgroundSize: '100% 100%',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center',
                        padding: '100px 220px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 6
                      }}
                    >
                      <div
                        className="text-content"
                        style={{
                          fontFamily: 'Arial, sans-serif',
                          fontSize: '56px',
                          lineHeight: '1.3',
                          letterSpacing: '1px',
                          color: '#312116',
                          textAlign: 'center',
                          width: '100%'
                        }}
                        dangerouslySetInnerHTML={{ __html: currentPage.text || '' }}
                      />
                    </div>
                  )}

                  {/* Character - matches Workflow 3: <div class="character" style="..."><img class="sprite" src="..." alt=""></div> */}
                  {currentPage.characterUrl && CHAR_POSITIONS[currentPage.pageNumber] && (() => {
                    const pos = CHAR_POSITIONS[currentPage.pageNumber];
                    // Apply overrides for pages 3, 4, 14 (same as Workflow 3)
                    let finalPos = pos;
                    if (currentPage.pageNumber === 3) {
                      finalPos = { left: 1020, top: 2142, w: 1100, flip: -1 };
                    } else if (currentPage.pageNumber === 4) {
                      finalPos = { left: 1530, top: 1734, w: 1100, flip: 1 };
                    } else if (currentPage.pageNumber === 14) {
                      finalPos = { left: 893, top: 1836, w: 1500, flip: 1 };
                    }
                    
                    // Use pixels directly (browser uses 96dpi, not 300dpi, so inches won't match)
                    // Workflow 3 uses inches for PDFMonkey, but we need pixels for browser rendering
                    let transform = `translate(-50%,-100%) scaleX(${finalPos.flip})`;
                    if (currentPage.pageNumber === 4) {
                      transform += ' rotate(-20deg)';
                    }
                    
                    return (
                      <div
                        className="character absolute"
                        style={{
                          left: `${finalPos.left}px`,
                          top: `${finalPos.top}px`,
                          width: `${finalPos.w}px`,
                          transform,
                          zIndex: 11,
                          pointerEvents: 'none' // Prevent interaction issues
                        }}
                      >
                        <img
                          className="sprite"
                          src={currentPage.characterUrl}
                          alt=""
                          style={{ width: '100%', height: 'auto', display: 'block' }}
                        />
                      </div>
                    );
                  })()}

                  {/* Animal - matches Workflow 3 structure */}
                  {currentPage.animalUrl && ANIMAL_POSITIONS[currentPage.pageNumber as keyof typeof ANIMAL_POSITIONS] && (() => {
                    const pos = ANIMAL_POSITIONS[currentPage.pageNumber as keyof typeof ANIMAL_POSITIONS];
                    
                    return (
                      <div
                        className="animal absolute"
                        style={{
                          left: `${pos.left}px`,
                          top: `${pos.top}px`,
                          width: `${pos.w}px`,
                          transform: 'translate(-50%,-100%)',
                          zIndex: 9
                        }}
                      >
                        <img
                          className="sprite"
                          src={currentPage.animalUrl}
                          alt={currentPage.pageNumber === 13 ? 'Animal Appears' : 'Animal Flying'}
                          style={{ width: '100%', height: 'auto', display: 'block' }}
                        />
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        {!loadingPages && !pagesError && !currentPage && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="h-[800px] bg-gray-50 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No pages available</p>
                <p className="text-gray-400 text-xs mt-2">
                  Debug: loadingPages={String(loadingPages)}, pagesError={String(pagesError)}, 
                  pages.length={pages.length}, pageNumber={pageNumber}
                </p>
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
