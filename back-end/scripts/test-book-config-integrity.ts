#!/usr/bin/env tsx

import {
  buildBookConfigPublishPayload,
  computeBookConfigChecksum,
  loadBundledBookConfig,
  listBundledBookConfigs,
  parsePublishedBookConfigRow,
  verifyBundledBookConfigIntegrity,
} from '@/lib/books';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const configs = listBundledBookConfigs();
  const [config] = configs;
  assert(config, 'Expected at least one bundled book config');

  const innerVoiceV1 = configs.find((item) => item.bookId === 'book-finding-our-inner-voice' && item.version === 1);
  const innerVoiceV2 = configs.find((item) => item.bookId === 'book-finding-our-inner-voice' && item.version === 2);
  assert(innerVoiceV1?.formats.standard.print.provider === 'lulu', 'Inner Voice v1 must remain assigned to Lulu');
  assert(innerVoiceV2?.status === 'draft', 'Inner Voice Gelato config must remain an unpublished draft');
  assert(innerVoiceV2, 'Expected a version 2 Inner Voice Gelato config');
  assert(loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice' }).version === 1, 'Implicit Inner Voice selection must remain pinned to v1');
  assert(loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 1 }).formats.standard.print.provider === 'lulu', 'Explicit Inner Voice v1 selection must remain Lulu');
  assert(loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 2 }).formats.standard.print.provider === 'gelato', 'Explicit Inner Voice v2 selection must be Gelato');

  const expectedProductUid = 'photobooks-softcover_pf_200x200-mm-8x8-inch_pt_170-gsm-65lb-coated-silk_cl_4-4_ccl_4-4_bt_glued-left_ct_matt-lamination_prt_1-0_cpt_250-gsm-100-lb-cover-coated-silk_ver';
  for (const [formatId, format] of Object.entries(innerVoiceV2.formats)) {
    assert(format.print.provider === 'gelato', `${formatId} must select Gelato in v2`);
    assert(format.print.productUid === expectedProductUid, `${formatId} must use the confirmed Gelato product`);
    assert(format.print.innerPageCount === 32, `${formatId} must retain 32 inner pages`);
    assert(format.print.apiPageCount === 32, `${formatId} must keep API page count explicit and provisional`);
    assert(format.print.apiPageCountVerified === true, `${formatId} must use the product-specific verified quote count`);
    assert(format.print.expectedPdfPageCount === 35, `${formatId} must expect the 35-page Gelato template structure`);
    assert(format.interior.expectedPageCount === 32 && format.interior.pageSequence.length === 32, `${formatId} must keep 32 configured interior pages`);
    assert(Math.abs(format.trimIn.w * 25.4 - 200) < 0.0001, `${formatId} trim width must match 200 mm`);
    assert(Math.abs(format.trimIn.h * 25.4 - 200) < 0.0001, `${formatId} trim height must match 200 mm`);
    assert(Math.abs(format.bleedIn.w * 25.4 - 206) < 0.0001, `${formatId} full-bleed page width must match 206 mm template`);
    assert(Math.abs(format.bleedIn.h * 25.4 - 206) < 0.0001, `${formatId} full-bleed page height must match 206 mm template`);
    assert(Math.abs(format.cover.spreadSizeIn.w * 25.4 - 409.03) < 0.0001, `${formatId} cover spread width must match the template`);
    assert(Math.abs(format.cover.spreadSizeIn.h * 25.4 - 206) < 0.0001, `${formatId} cover spread height must match the template`);
    assert(format.print.printGeometryMm.interiorCanvas.w === 206 && format.print.printGeometryMm.interiorCanvas.h === 206, `${formatId} Gelato page canvas must match the product API`);
    assert(format.print.printGeometryMm.bleed === 3, `${formatId} Gelato bleed must match the product API`);
    assert(format.print.printGeometryMm.spine.w === 3.03, `${formatId} cover spine must match the product API`);
    assert(format.print.printGeometryMm.backPanel.x === 3 && format.print.printGeometryMm.frontPanel.x === 206.03, `${formatId} cover panels must align with the product API`);
    assert(JSON.stringify(format.print.shipmentMethodPolicy.destinationCountries) === '["US"]', `${formatId} must limit shipment policy to verified US destinations`);
    const methods = { standard: 'usps_ground_advantage', priority: 'usps_priority_mail_standard', expedited: 'ups_2_day' };
    for (const [tier, uid] of Object.entries(methods)) {
      const rule = format.print.shipmentMethodPolicy.tiers[tier];
      assert(rule.kind === 'uid' && rule.uid === uid, `${formatId} ${tier} shipping must select the verified UID`);
    }
  }

  const payload = buildBookConfigPublishPayload(config, {
    publishedBy: 'test-book-config-integrity',
    activate: true,
    now: '2026-05-05T00:00:00.000Z',
  });

  assert(payload.book_id === config.bookId, 'Publish payload should include book_id');
  assert(payload.version === config.version, 'Publish payload should include version');
  assert(payload.schema === config.schema, 'Publish payload should include schema');
  assert(payload.status === config.status, 'Publish payload should include status');
  assert(
    payload.default_format_id === config.defaultFormatId,
    'Publish payload should include default_format_id',
  );
  assert(payload.config_json === config, 'Publish payload should include config_json');
  assert(
    payload.checksum === computeBookConfigChecksum(config),
    'Publish payload should include canonical checksum',
  );
  assert(payload.is_active === true, 'Publish payload should include activation intent');
  assert(
    payload.published_at === payload.updated_at,
    'Publish payload should keep published_at and updated_at in the same write payload',
  );

  const parsed = parsePublishedBookConfigRow(payload);
  assert(parsed.checksum === payload.checksum, 'Valid publish payload should parse strictly');

  let rejectedChecksumMismatch = false;
  try {
    parsePublishedBookConfigRow({
      ...payload,
      checksum: '0'.repeat(64),
    });
  } catch (error) {
    rejectedChecksumMismatch =
      error instanceof Error &&
      error.message.includes('Published row checksum mismatch');
  }
  assert(
    rejectedChecksumMismatch,
    'Strict published row parsing should reject checksum mismatches',
  );

  const bundledResult = await verifyBundledBookConfigIntegrity();
  assert(bundledResult.ok, 'Bundled book config integrity should pass');
  assert(
    bundledResult.items.length === configs.length,
    'Bundled integrity should check every bundled config',
  );

  console.log('test-book-config-integrity: ok');
}

main().catch((error) => {
  console.error('test-book-config-integrity: failed');
  console.error(error);
  process.exit(1);
});
