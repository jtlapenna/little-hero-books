import { buildBgRemovedPoseAssetKey } from "@/lib/order-paths";
import type {
  BookPageConfig,
  BookRenderSnapshot,
  BookCharacterPlacementEntry,
} from "./types";
import {
  BookLayerPlacementSchema,
  type BookCopyBlock,
  type BookPageLayer,
} from "./book-render-contract";
import type { BookCharacterPlacementMap } from "./character-placement";
import { validateRenderSnapshot } from "./book-render-recipe";

type JsonRecord = Record<string, unknown>;
export interface ConfiguredRenderOptions {
  characterPlacementOverride?: BookCharacterPlacementMap;
  animalPlacementOverride?: BookCharacterPlacementMap;
  coverCharacterPlacementOverride?: BookCharacterPlacementEntry | null;
}
const record = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const escape = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function guideSlug(value: unknown): string {
  const slug = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (["trex", "dinosaur"].includes(slug)) return "t-rex";
  if (
    !["cat", "dog", "owl", "lion", "tiger", "penguin", "unicorn"].includes(slug)
  )
    throw new Error("Configured book requires a supported animal guide");
  return slug;
}
export function resolveConfiguredLayerPlacement(
  layer: BookPageLayer,
  index: number,
  override?: BookCharacterPlacementEntry | null,
): BookPageLayer["placement"] {
  const defined = Object.fromEntries(
    Object.entries(override ?? {}).filter(([, value]) => value !== undefined),
  );
  return BookLayerPlacementSchema.parse({
    ...layer.placement,
    zIndex: layer.placement.zIndex ?? Math.min(1000, 10 + index),
    ...defined,
  });
}
function placementStyle(value: BookPageLayer["placement"]): string {
  const transforms = [
    `rotate(${value.rotateDeg ?? 0}deg)`,
    ...(value.flipX ? [`translateX(${value.width}px)`, "scaleX(-1)"] : []),
  ];
  return `position:absolute;left:${value.left}px;top:${value.top}px;width:${value.width}px;${value.height ? `height:${value.height}px;` : ""}z-index:${value.zIndex ?? 10};transform:${transforms.join(" ")};transform-origin:0 0;`;
}
export function renderConfiguredBook(
  input: JsonRecord,
  frozen: BookRenderSnapshot,
  options: ConfiguredRenderOptions = {},
) {
  const snapshot = validateRenderSnapshot(frozen, {
    bookId: text(input.bookId),
    formatId: text(input.formatId),
    version:
      input.configVersion == null ? undefined : Number(input.configVersion),
  });
  const config = snapshot.bookConfig,
    recipe = config.rendering.recipe!,
    formatId = snapshot.formatId;
  if (
    config.status === "draft" &&
    input.testMode !== true &&
    !snapshot.testOnly
  )
    throw new Error("Draft configured book rendering requires testMode:true");
  const backend = text(input.backendUrl).replace(/\/$/, "");
  const assetUrl = (key: string | undefined) => {
    if (!key) throw new Error("Missing configured asset key");
    return `${backend}/api/assets/${key}`;
  };
  const specs = record(input.characterSpecs),
    guide = guideSlug(specs.animalGuide);
  const name = text(specs.childName);
  if (!name) throw new Error("Configured book requires child name");
  const pronoun = text(specs.pronouns).toLowerCase();
  const pronouns = ["she", "she/her"].includes(pronoun)
    ? { subject: "she", object: "her", possessive: "her" }
    : ["he", "he/him"].includes(pronoun)
      ? { subject: "he", object: "him", possessive: "his" }
      : { subject: "they", object: "them", possessive: "their" };
  const clue = ["owl", "penguin"].includes(guide)
    ? "a feather"
    : guide === "unicorn"
      ? "a tuft of colorful fur"
      : guide === "t-rex"
        ? "a giant footprint"
        : "a paw print";
  const clues = ["owl", "penguin"].includes(guide)
    ? "feathers"
    : guide === "unicorn"
      ? "colorful fur"
      : guide === "t-rex"
        ? "giant footprints"
        : "paw prints";
  const guideName =
    guide === "t-rex" ? "T-Rex" : guide[0].toUpperCase() + guide.slice(1);
  const tokens: Record<string, string> = {
    "child name": name,
    hometown: text(specs.hometown) || "a cozy town",
    "animal guide": guideName,
    "animal clue": clue,
    "animal clues": clues,
    "object pronoun": pronouns.object,
    "subject pronoun": pronouns.subject,
    "possessive pronoun": pronouns.possessive,
    "dedication message":
      text(input.dedicationText) ||
      text(record(input.bookSpecs).dedicationMessage),
  };
  const interpolate = (copy: string) =>
    copy.replace(/\[([^\]]+)\]/g, (_match, token: string) => {
      const value = tokens[token.toLowerCase()];
      if (value === undefined)
        throw new Error(`Unknown configured copy token ${token}`);
      return value;
    });
  const processed = Array.isArray(input.processedImages)
    ? input.processedImages.map(record)
    : [];
  const poses = new Map<number, string>();
  for (const pose of processed) {
    const number = Number(pose.poseNumber),
      path =
        text(pose.publicUrl) ||
        text(pose.imagePath) ||
        (text(pose.r2Path) ? assetUrl(text(pose.r2Path)) : "");
    if (!Number.isInteger(number) || number < 0 || number > 99 || !path)
      continue;
    if (poses.has(number))
      throw new Error(`Duplicate configured pose asset ${number}`);
    if (!/^https?:\/\//.test(path) && !path.startsWith("/api/assets/"))
      throw new Error(`Invalid configured pose URL ${number}`);
    poses.set(number, path);
  }
  const poseUrl = (number: number) => {
    if (poses.has(number)) return poses.get(number)!;
    if (number === 0 && text(input.characterHash))
      return assetUrl(
        buildBgRemovedPoseAssetKey(text(input.characterHash), 0, config.bookId),
      );
    throw new Error(`Missing configured pose asset ${number}`);
  };
  const overlays: JsonRecord[] = [],
    backgrounds: JsonRecord[] = [];
  const css = `.lhb-config-page{position:relative;display:block;overflow:hidden;margin:0;padding:0;background:#fff;color:#fff4d7;font-family:LhbConfiguredBook,sans-serif;isolation:isolate}.lhb-config-page *{box-sizing:border-box}.lhb-config-page img{display:block;max-width:none;margin:0;padding:0;border:0}.lhb-config-page .lhb-copy{position:absolute;white-space:pre-line;overflow-wrap:anywhere;margin:0;font-weight:400}.lhb-config-page .lhb-layer{object-fit:contain}.lhb-config-page .lhb-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;z-index:0}@font-face{font-family:LhbConfiguredBook;src:url('${assetUrl(config.assets.fonts.primary)}')}`;
  const copyHtml = (copy: BookCopyBlock | undefined) =>
    copy
      ? `<div class="lhb-copy" style="${placementStyle(copy.placement)}font-size:${copy.fontSize}px;line-height:${copy.lineHeight};color:${copy.color};text-align:${copy.align};padding:${copy.padding}px;${copy.backgroundColor ? `background:${copy.backgroundColor};` : ""}">${escape(interpolate(copy.text))}</div>`
      : "";
  const layerHtml = (
    layers: BookPageLayer[],
    pageLabel: string,
    storyPage: number | null,
    cover = false,
  ) => {
    let firstPose = true,
      firstAnimal = true;
    return layers
      .map((layer, index) => {
        let placement = resolveConfiguredLayerPlacement(layer, index),
          url: string;
        let editable = "";
        if (layer.kind === "pose") {
          url = poseUrl(layer.poseNumber);
          if (firstPose) {
            editable = ' data-editable-character="true"';
            const override = cover
              ? options.coverCharacterPlacementOverride
              : storyPage == null
                ? undefined
                : options.characterPlacementOverride?.[storyPage];
            if (override)
              placement = resolveConfiguredLayerPlacement(
                layer,
                index,
                override,
              );
            firstPose = false;
          }
        } else if (layer.kind === "overlay")
          url = assetUrl(config.assets.overlays[layer.assetSlot]);
        else {
          url = assetUrl(recipe.animals[guide]?.[layer.role]);
          if (
            firstAnimal &&
            storyPage != null &&
            options.animalPlacementOverride?.[storyPage]
          )
            placement = resolveConfiguredLayerPlacement(
              layer,
              index,
              options.animalPlacementOverride[storyPage],
            );
          firstAnimal = false;
        }
        if (layer.kind !== "pose")
          overlays.push({
            pageLabel,
            layerId: layer.id,
            kind: layer.kind,
            imagePath: url,
          });
        return `<img class="lhb-layer" data-layer-id="${escape(layer.id)}" data-layer-kind="${layer.kind}"${editable} src="${escape(url)}" alt="" style="${placementStyle(placement)}" />`;
      })
      .join("");
  };
  const page = (
    backgroundKey: string | null,
    layers: string,
    copy: string,
    width: number,
    height: number,
    label: string,
  ) =>
    `<style>${css}</style><div class="lhb-config-page" data-page-label="${escape(label)}" style="width:${width}px;height:${height}px">${backgroundKey ? `<img class="lhb-bg" alt="" src="${escape(assetUrl(backgroundKey))}" />` : ""}${layers}${copy}</div>`;
  const pageBlocks = config.formats[formatId].interior.pageSequence.map(
    (configuredPage: BookPageConfig) => {
      const key = configuredPage.backgroundSlot
        ? config.assets.backgrounds[configuredPage.backgroundSlot]
        : null;
      if (key)
        backgrounds.push({
          pageLabel: configuredPage.label,
          pageNumber: configuredPage.index,
          r2Key: key,
          imagePath: assetUrl(key),
        });
      const html = page(
        key,
        layerHtml(
          configuredPage.layers ?? [],
          configuredPage.label,
          configuredPage.storyPageNumber,
        ),
        copyHtml(recipe.copy[configuredPage.id]),
        config.rendering.preview.interiorPx.w,
        config.rendering.preview.interiorPx.h,
        configuredPage.label,
      );
      return { page: configuredPage, html };
    },
  );
  const cover = recipe.covers[formatId],
    coverKey = config.assets.backgrounds[cover.backgroundSlot];
  const coverHTML = page(
    coverKey,
    layerHtml(cover.layers, "cover", null, true),
    cover.texts.map(copyHtml).join(""),
    config.rendering.preview.coverPx.w,
    config.rendering.preview.coverPx.h,
    "cover",
  );
  return {
    config,
    formatId,
    pageBlocks,
    page_css: css,
    coverHTML,
    coverKey,
    coverTemplateId: cover.templateId,
    backgroundImages: backgrounds,
    overlayImages: overlays,
    animalImages: {
      slug: guide,
      displayName: guideName,
      ...recipe.animals[guide],
    },
    processedImages: processed,
    characterImages: {
      poses: [...poses].map(([poseNumber, imagePath]) => ({
        poseNumber,
        imagePath,
      })),
    },
    storyTexts: pageBlocks.map(({ page }) => ({
      pageNumber: page.index,
      text: interpolate(recipe.copy[page.id]?.text ?? ""),
    })),
    pronounsResolved: pronouns,
    animalDisplayName: guideName,
    trailType: clues,
  };
}
