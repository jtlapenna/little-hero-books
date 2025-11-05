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
  backgroundUrl: string;
  characterUrl: string | null;
  animalUrl: string | null;
  text: string;
  textBoxOverlayUrl: string;
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

// Convert px to inches at 300dpi
function px2in(px: number): string {
  return (px / 300).toFixed(4) + 'in';
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
        // Fetch 2B manifest to get page data
        const manifestKey = `book-mvp-simple-adventure/orders/${orderId}/manifests/2b-manifest.json`;
        const manifestUrl = `${backendUrl}/api/manifests/${manifestKey}`;

        console.log('[Pages] Fetching 2B manifest:', manifestUrl);
        const manifestRes = await fetch(manifestUrl);
        if (!manifestRes.ok) {
          throw new Error(`Failed to fetch manifest: ${manifestRes.status}`);
        }
        const manifest = await manifestRes.json();

        const { order: orderData, entries } = manifest || {};
        const characterHash = manifest?.characterHash || orderData?.characterHash;
        const characterSpecs = orderData?.characterSpecs || {};
        const childName = characterSpecs.childName || 'Child';
        const hometown = characterSpecs.hometown || 'Seattle';

        // Get animal guide
        const rawAnimalInput = String(characterSpecs.animalGuide || 'tiger');
        const animalSlug = rawAnimalInput
          .replace(/[^a-z0-9\s-]/gi, '')
          .replace(/\s+/g, '-')
          .toLowerCase();
        const animalDisplayName = characterSpecs.animalDisplayName || rawAnimalInput;

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

        // Build animal images
        const animalImages = {
          appears: `${backendUrl}/api/assets/book-mvp-simple-adventure/animals/${animalSlug}/appears.png`,
          flying: `${backendUrl}/api/assets/book-mvp-simple-adventure/animals/${animalSlug}/flying.png`
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
      } catch (error: any) {
        if (!isMounted) return;
        console.error('[Pages] Error loading pages:', error);
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
            <div className="h-[800px] bg-gray-100 overflow-auto flex items-center justify-center p-4">
              <div
                className="relative"
                style={{
                  width: '11.25in',
                  height: '8.75in',
                  backgroundColor: '#fff',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                }}
              >
                {/* Background */}
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${currentPage.backgroundUrl})` }}
                />

                {/* Text Box Overlay */}
                <div
                  className="absolute"
                  style={{
                    left: '0.5in',
                    top: '0.25in',
                    width: '5.5in',
                    height: '1.5in',
                    backgroundImage: `url(${currentPage.textBoxOverlayUrl})`,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center'
                  }}
                >
                  <div
                    className="text-content absolute inset-0 flex items-center px-4"
                    style={{
                      fontFamily: 'Arial, sans-serif',
                      fontSize: '18px',
                      lineHeight: '1.3',
                      color: '#000'
                    }}
                    dangerouslySetInnerHTML={{ __html: currentPage.text }}
                  />
                </div>

                {/* Character */}
                {currentPage.characterUrl && CHAR_POSITIONS[currentPage.pageNumber] && (() => {
                  const pos = CHAR_POSITIONS[currentPage.pageNumber];
                  return (
                    <div
                      className="absolute"
                      style={{
                        left: px2in(pos.left),
                        top: px2in(pos.top),
                        width: px2in(pos.w),
                        transform: `translate(-50%, -100%) scaleX(${pos.flip})`,
                        zIndex: 11
                      }}
                    >
                      <img
                        src={currentPage.characterUrl}
                        alt="Character"
                        className="w-full h-auto"
                        style={{ display: 'block' }}
                      />
                    </div>
                  );
                })()}

                {/* Animal */}
                {currentPage.animalUrl && ANIMAL_POSITIONS[currentPage.pageNumber as keyof typeof ANIMAL_POSITIONS] && (() => {
                  const pos = ANIMAL_POSITIONS[currentPage.pageNumber as keyof typeof ANIMAL_POSITIONS];
                  return (
                    <div
                      className="absolute"
                      style={{
                        left: px2in(pos.left),
                        top: px2in(pos.top),
                        width: px2in(pos.w),
                        transform: 'translate(-50%, -100%)',
                        zIndex: 9
                      }}
                    >
                      <img
                        src={currentPage.animalUrl}
                        alt="Animal guide"
                        className="w-full h-auto"
                        style={{ display: 'block' }}
                      />
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {!loadingPages && !pagesError && !currentPage && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="h-[800px] bg-gray-50 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No pages available</p>
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
