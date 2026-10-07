import assert from "node:assert/strict";
import { configuredBookFixture } from "./configured-book-fixture";
import { buildW0RunManifestFromConfig } from "../src/lib/books/build-run-manifest";
import { buildW3AssemblyInput } from "../src/lib/books/w3-assembly-input";
import { buildW3CalibrationResponse } from "../src/lib/w3-calibration";

async function main() {
  const config = configuredBookFixture(),
    orderId = "CALIBRATE-CONFIGURED-01";
  for (const format of Object.values(config.formats))
    Object.assign(format.interior.pageSequence[1].layers![0].placement, {
      rotateDeg: 30,
      zIndex: 35,
      height: 300,
      flipX: true,
    });
  for (const format of Object.values(config.formats))
    format.interior.pageSequence[1].layers![1].placement.zIndex = 35;
  const w0 = buildW0RunManifestFromConfig(config, {
    orderId,
    platform: "d2c",
    formatId: "standard",
    characterHash: "testhash",
    input: { characterSpecs: { childName: "Ada", animalGuide: "owl" } },
  });
  const twoB = {
    characterHash: "testhash",
    order: { orderId, bookId: config.bookId },
    entries: [13, 17, 18].map((poseNumber) => ({
      poseNumber,
      bgRemovedKey: `${config.bookId}/generated/pose${poseNumber}.png`,
    })),
  };
  const assembly = await buildW3AssemblyInput(
    {
      orderId,
      bookId: config.bookId,
      formatId: "standard",
      testMode: true,
      testModePages: 0,
    },
    {
      loadManifest: async (key) =>
        key.endsWith("1-manifest.json")
          ? w0
          : key.endsWith("2b-manifest.json")
            ? twoB
            : null,
    },
  );
  const inspected: string[] = [];
  const result = await buildW3CalibrationResponse(
    {
      sourceType: "order",
      orderId,
      selectedStoryPageNumber: 1,
      selectedPoseNumber: 17,
      characterPlacementOverrideByStoryPage: {
        1: { left: 222, top: 333, width: 555 },
      },
    },
    {
      buildAssemblyInput: async () => assembly,
      inspectPose: async (input) => {
        inspected.push(input.referenceKey!);
        throw new Error("Fixture inspection unavailable");
      },
    },
  );
  assert.equal(
    result.pages.find((page) => page.pageLabel === "p01")?.poseNumber,
    13,
  );
  assert.equal(
    result.pages.find((page) => page.pageLabel === "cover")?.poseNumber,
    18,
  );
  assert.equal(
    result.pages.find((page) => page.pageLabel === "p01")?.currentPlacement
      ?.left,
    222,
  );
  assert.ok(
    result.poses
      .find((pose) => pose.poseNumber === 17)
      ?.referenceUrl.endsWith("/custom-breath.png"),
  );
  assert.deepEqual(
    result.poses.find((pose) => pose.poseNumber === 17)?.usedByStoryPages,
    [1],
  );
  assert.ok(inspected[0].endsWith("/custom-breath.png"));
  assert.equal(result.selectedPage!.currentPlacement!.anchorXPercent, 0);
  assert.equal(
    result.selectedPage!.fixedLayers!.find((layer) => layer.id === "vignette")!
      .placement.left,
    100,
  );
  assert.equal(result.selectedPage!.currentPlacement!.rotateDeg, 30);
  assert.equal(result.selectedPage!.currentPlacement!.zIndex, 35);
  assert.equal(result.selectedPage!.editableLayerPlacement!.height, 300);
  assert.equal(result.selectedPage!.editableLayerIndex, 0);
  assert.equal(result.selectedPage!.fixedLayers![0].index, 1);
  assert.equal(result.selectedPage!.fixedLayers![0].placement.zIndex, 35);
  const html = result.selectedPage!.currentSrcDoc;
  assert.ok(html);
  assert.ok(html.indexOf('data-layer-id="hero"') < html.indexOf('data-layer-id="vignette"'));
  assert.ok(html.includes("rotate(30deg)"));
  assert.ok(html.includes("z-index:35"));
  assert.ok(html.includes("translateX(555px)"));
  assert.ok(
    result.selectedPage!.fixedLayers!.find((layer) => layer.id === "vignette")!
      .placement.zIndex! > 10,
  );
  assert.ok(
    html.includes('data-layer-id="hero"') &&
      html.includes("left:222px;top:333px;width:555px"),
  );
  assert.ok(
    html.includes('data-layer-id="vignette"') &&
      html.includes("left:100px;top:200px;width:700px"),
  );
  assert.deepEqual(result.viewport, {
    width: config.rendering.preview.interiorPx.w,
    height: config.rendering.preview.interiorPx.h,
  });
  console.log(
    "Configured frozen calibration and first-layer override checks passed",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
