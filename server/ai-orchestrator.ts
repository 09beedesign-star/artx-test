import { brandKitToPrompt, getBrandKit } from "./brand-kit";
import { editImageWithPrompt, eraseImageObjects, expandImageWithPicWish, generateImages, removeImageBackground } from "./image-generation";
import { generateText } from "./text-generation";
import { getSkill, matchSkill } from "./skill-registry";
import { resolveModelRoute, type AiCapability } from "./model-router";

export type OrchestrateRequest = {
  intent?: string;
  capability?: AiCapability;
  operation?: string;
  prompt?: string;
  model?: string;
  ratio?: string;
  count?: number;
  imageSrc?: string;
  image_url?: string;
  image_base64?: string;
  images?: Array<{ src: string; title?: string }>;
  maskSrc?: string;
  mask_url?: string;
  mask_base64?: string;
  targetWidth?: number;
  targetHeight?: number;
  brandKitId?: string;
  skillId?: string;
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
};

export type OrchestrateResponse = {
  type: "text" | "image";
  capability: AiCapability;
  model: string;
  text?: string;
  images?: Array<{ src: string; width: number; height: number }>;
  image_base64?: string;
  providerTaskId?: string;
  providerTaskIds?: string[];
  route: string;
  skill?: string;
};

function inferCapability(input: OrchestrateRequest): AiCapability {
  if (input.capability) return input.capability;
  const token = `${input.intent || ""} ${input.operation || ""}`.toLowerCase();
  if (/remove.*background|background.*removal|去背|去除背景|抠图/.test(token)) return "background_removal";
  if (/erase|eraser|element.*erasure|擦除|橡皮/.test(token)) return "element_erasure";
  if (/expand|outpaint|扩图|扩展/.test(token)) return "image_expansion";
  if (/edit|局部|重绘|修改/.test(token) && (input.imageSrc || input.image_url || input.image_base64)) return "image_edit";
  if (/image|generate|poster|生图|生成图片|海报/.test(token)) return "text_to_image";
  return input.imageSrc || input.image_url || input.image_base64 ? "image_edit" : "chat";
}

function asDataUrl(value?: string, fallbackMime = "image/png") {
  if (!value) return undefined;
  if (value.startsWith("data:") || /^https?:\/\//i.test(value)) return value;
  return `data:${fallbackMime};base64,${value}`;
}

function firstImageBase64(images?: Array<{ src: string }>) {
  const src = images?.[0]?.src || "";
  const marker = ";base64,";
  const index = src.indexOf(marker);
  return index >= 0 ? src.slice(index + marker.length) : undefined;
}

function buildPrompt(input: OrchestrateRequest, brandPrompt: string, skillPrompt = "") {
  return [
    skillPrompt ? `能力说明：\n${skillPrompt}` : "",
    brandPrompt ? `品牌约束：\n${brandPrompt}` : "",
    input.prompt || "",
  ].filter(Boolean).join("\n\n").trim();
}

export class AIOrchestrator {
  async run(input: OrchestrateRequest): Promise<OrchestrateResponse> {
    const capability = inferCapability(input);
    const route = resolveModelRoute(capability, input.model);
    const imageSrc = input.imageSrc || input.image_url || asDataUrl(input.image_base64);
    const images = input.images?.length ? input.images : imageSrc ? [{ src: imageSrc }] : undefined;
    const maskSrc = input.maskSrc || input.mask_url || asDataUrl(input.mask_base64);
    const brandKit = input.brandKitId ? await getBrandKit(input.brandKitId) : undefined;
    const skill = input.skillId ? await getSkill(input.skillId) : await matchSkill(capability, input.prompt);
    const prompt = buildPrompt(input, brandKitToPrompt(brandKit), skill?.prompt);

    if (capability === "chat" || capability === "brand_kit_parse") {
      const result = await generateText({
        prompt,
        messages: input.messages,
        model: route.model,
        module: capability,
        images,
      });
      return {
        type: "text",
        capability,
        model: result.model,
        text: result.text,
        route: route.provider,
        skill: skill?.id,
      };
    }

    if (capability === "background_removal") {
      if (!imageSrc) throw new Error("Missing image for background removal");
      const result = await removeImageBackground({
        imageSrc,
        model: route.model,
        prompt: prompt || "Remove background only. Preserve foreground pixels and alpha channel.",
      });
      return {
        type: "image",
        capability,
        model: route.model,
        images: result.images,
        image_base64: firstImageBase64(result.images),
        providerTaskId: result.providerTaskId,
        providerTaskIds: result.providerTaskIds,
        route: route.provider,
        skill: skill?.id,
      };
    }

    if (capability === "image_expansion") {
      if (!imageSrc || !maskSrc) throw new Error("Missing image or mask");
      const result = await expandImageWithPicWish({
        imageSrc,
        maskSrc,
        model: route.model,
        prompt: prompt || "Outpaint only the blank transparent extension area outside the original image. Preserve every unmasked pixel exactly. Analyze the original background, floor, wall, light, shadows, color, texture, perspective, and edge details, then generate new matching surrounding environment only in the editable area. Do not enlarge, duplicate, mirror, repeat, or redraw the original subject/person/object. Do not paste a scaled copy of the original image into the extension. Do not create a blurred border or vignette.",
        targetWidth: input.targetWidth,
        targetHeight: input.targetHeight,
      });
      return {
        type: "image",
        capability,
        model: route.model,
        images: result.images,
        image_base64: firstImageBase64(result.images),
        providerTaskId: result.providerTaskId,
        providerTaskIds: result.providerTaskIds,
        route: route.provider,
        skill: skill?.id,
      };
    }

    if (capability === "element_erasure") {
      if (!imageSrc || !maskSrc) throw new Error("Missing image or mask");
      const result = await eraseImageObjects({
        imageSrc,
        maskSrc,
        model: route.model,
        prompt: prompt || "Remove only the masked content and rebuild the area naturally. Preserve unmasked pixels.",
        targetWidth: input.targetWidth,
        targetHeight: input.targetHeight,
        preserveUnmaskedPixels: true,
      });
      return {
        type: "image",
        capability,
        model: route.model,
        images: result.images,
        image_base64: firstImageBase64(result.images),
        providerTaskId: result.providerTaskId,
        providerTaskIds: result.providerTaskIds,
        route: route.provider,
        skill: skill?.id,
      };
    }

    if (capability === "image_edit") {
      if (!imageSrc) throw new Error("Missing image for edit");
      const result = await editImageWithPrompt({
        imageSrc,
        model: route.model,
        prompt: prompt || "Edit the image according to the user instruction. Preserve composition and aspect ratio.",
        targetWidth: input.targetWidth,
        targetHeight: input.targetHeight,
        images,
      });
      return {
        type: "image",
        capability,
        model: route.model,
        images: result.images,
        image_base64: firstImageBase64(result.images),
        route: route.provider,
        skill: skill?.id,
      };
    }

    const result = await generateImages({
      prompt: prompt || "Generate an image.",
      model: route.model,
      ratio: input.ratio,
      count: input.count,
      images,
    });

    return {
      type: "image",
      capability,
      model: route.model,
      images: result.images,
      image_base64: firstImageBase64(result.images),
      route: route.provider,
      skill: skill?.id,
    };
  }
}
