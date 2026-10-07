import source from '../src/lib/books/configs/book-2-example/v1.json';
import { BookConfigSchema } from '../src/lib/books/types';

export function configuredBookRaw() {
  const raw = JSON.parse(JSON.stringify(source).replaceAll('book-2-example', 'book-contract-fixture'));
  raw.status = 'active';
  const placement = { left: 100, top: 200, width: 700 };
  const pose = (id: string, poseId: string, poseNumber: number) => ({ id, kind: 'pose', poseId, poseNumber, placement });
  for (const format of Object.values(raw.formats) as Array<{ interior: { expectedPageCount: number; pageSequence: unknown[] } }>) {
    format.interior.expectedPageCount = 3;
    format.interior.pageSequence = [
      { index: 0, id: 'title', label: 'p00', type: 'title', storyPageNumber: null, backgroundSlot: 'titlePage', poseNumber: null, overlaySlot: null, required: true, layers: [] },
      { index: 1, id: 'scene-a', label: 'p01', type: 'story', storyPageNumber: 1, backgroundSlot: 'story_01', poseNumber: 13, overlaySlot: null, required: true, layers: [pose('hero', 'custom-run', 13), pose('vignette', 'custom-breath', 17)] },
      { index: 2, id: 'scene-b', label: 'p02', type: 'story', storyPageNumber: 2, backgroundSlot: 'story_02', poseNumber: 13, overlaySlot: null, required: true, layers: [pose('hero', 'custom-run', 13)] },
    ];
  }
  raw.qa.pose.requiredPoseNumbers = [13, 17, 18];
  raw.rendering.recipe = {
    schema: 'lhb.book-render@v1', pagePreviewTemplateId: '23277725-4AB0-446A-98C5-CB99C21822B3',
    poses: {
      'custom-run': { poseNumber: 13, referenceKey: 'book-contract-fixture/characters/references/custom-run.png' },
      'custom-breath': { poseNumber: 17, referenceKey: 'book-contract-fixture/characters/references/custom-breath.png' },
      'cover-only': { poseNumber: 18, referenceKey: 'book-contract-fixture/characters/references/custom-cover.png' },
    },
    copy: {
      title: { text: 'A configured title', placement: { left: 150, top: 160, width: 2200 }, fontSize: 80 },
      'scene-a': { text: '[Child Name] ran toward [animal guide].', placement: { left: 100, top: 100, width: 1200 }, fontSize: 50 },
      'scene-b': { text: '[Child Name] paused.\n[object pronoun] listened.', placement: { left: 100, top: 100, width: 1200 }, fontSize: 50 },
    }, animals: {},
    covers: {
      standard: { backgroundSlot: 'covers', templateId: 'D0F07D93-9267-47BB-A6AF-D6EC5ACDF476', layers: [pose('cover-child', 'cover-only', 18)], texts: [] },
      amazon: { backgroundSlot: 'coversAmazon', templateId: '8DB1D274-AA3C-4E14-B051-65B6F872B013', layers: [pose('cover-child', 'cover-only', 18)], texts: [] },
    },
  };
  return raw;
}
export function configuredBookFixture() { return BookConfigSchema.parse(configuredBookRaw()); }
