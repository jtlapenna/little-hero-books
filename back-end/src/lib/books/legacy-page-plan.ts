import type { BookPageConfig } from '@/lib/books/types';

export const LEGACY_STORY_TO_POSE_MAP: Record<number, number | null> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 3,
  8: 7,
  9: 8,
  10: 9,
  11: 10,
  12: 11,
  13: null,
  14: 12,
};

function buildLegacyStoryPages(startIndex: number): BookPageConfig[] {
  return Array.from({ length: 14 }, (_, index) => {
    const storyPageNumber = index + 1;
    const pageIndex = startIndex + index;
    const pageId = `story_${String(storyPageNumber).padStart(2, '0')}`;

    return {
      index: pageIndex,
      id: pageId,
      label: `p${String(pageIndex).padStart(2, '0')}`,
      type: 'story',
      storyPageNumber,
      backgroundSlot: pageId,
      poseNumber: LEGACY_STORY_TO_POSE_MAP[storyPageNumber] ?? null,
      overlaySlot: storyPageNumber === 5 ? 'animalTracks' : null,
      required: true,
    };
  });
}

export function buildLegacyBookPagePlan(useAmazonPlan: boolean): BookPageConfig[] {
  const storyPages = buildLegacyStoryPages(useAmazonPlan ? 3 : 1);

  if (!useAmazonPlan) {
    return [
      {
        index: 0,
        id: 'dedication',
        label: 'p00',
        type: 'dedication',
        storyPageNumber: null,
        backgroundSlot: 'dedication',
        poseNumber: null,
        overlaySlot: null,
        required: true,
      },
      ...storyPages,
    ];
  }

  return [
    {
      index: 0,
      id: 'title',
      label: 'p00',
      type: 'title',
      storyPageNumber: null,
      backgroundSlot: 'titlePage',
      poseNumber: null,
      overlaySlot: null,
      required: true,
    },
    {
      index: 1,
      id: 'blank_front_matter',
      label: 'p01',
      type: 'blank',
      storyPageNumber: null,
      backgroundSlot: null,
      poseNumber: null,
      overlaySlot: null,
      required: true,
    },
    {
      index: 2,
      id: 'dedication',
      label: 'p02',
      type: 'dedication',
      storyPageNumber: null,
      backgroundSlot: 'dedication',
      poseNumber: null,
      overlaySlot: null,
      required: true,
    },
    ...storyPages,
  ];
}
