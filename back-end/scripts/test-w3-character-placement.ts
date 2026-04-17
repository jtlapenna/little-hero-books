#!/usr/bin/env tsx

import {
  loadBundledBookConfig,
  resolveBookCharacterPlacementForStoryPage,
  resolveBookCharacterPlacementMap,
  type BookConfig,
} from '@/lib/books';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function main(): void {
  const config = loadBundledBookConfig({ bookId: 'book-mvp-simple-adventure' });
  const standardMap = resolveBookCharacterPlacementMap(config, 'standard');
  const amazonMap = resolveBookCharacterPlacementMap(config, 'amazon');

  assert(
    JSON.stringify(standardMap) === JSON.stringify(amazonMap),
    'Expected Book 1 standard and amazon formats to share the same default story-page placements',
  );

  const pageFourPlacement = resolveBookCharacterPlacementForStoryPage(config, 4, 'standard');
  assert(
    pageFourPlacement?.left === 1530 &&
      pageFourPlacement.top === 1734 &&
      pageFourPlacement.width === 1100 &&
      pageFourPlacement.rotateDeg === -20,
    'Expected story page 4 placement to resolve from config with the tuned legacy rotation intact',
  );

  const configWithOverride = cloneConfig(config) as BookConfig;
  configWithOverride.rendering.characterPlacement.overridesByFormat.amazon = {
    ...configWithOverride.rendering.characterPlacement.overridesByFormat.amazon,
    '4': {
      left: 1700,
      top: 1800,
      width: 1200,
      rotateDeg: -10,
      zIndex: 15,
    },
  };

  const overriddenAmazonPageFour = resolveBookCharacterPlacementForStoryPage(
    configWithOverride,
    4,
    'amazon',
  );
  const untouchedStandardPageFour = resolveBookCharacterPlacementForStoryPage(
    configWithOverride,
    4,
    'standard',
  );

  assert(
    overriddenAmazonPageFour?.left === 1700 &&
      overriddenAmazonPageFour.top === 1800 &&
      overriddenAmazonPageFour.width === 1200 &&
      overriddenAmazonPageFour.rotateDeg === -10 &&
      overriddenAmazonPageFour.zIndex === 15,
    'Expected amazon format override to replace the default story page placement when explicitly configured',
  );
  assert(
    untouchedStandardPageFour?.left === 1530 &&
      untouchedStandardPageFour.top === 1734 &&
      untouchedStandardPageFour.width === 1100 &&
      untouchedStandardPageFour.rotateDeg === -20,
    'Expected format-specific overrides to leave the shared default placement untouched for other formats',
  );

  console.log('W3 character placement tests passed');
}

main();
