export type BackgroundImageTaskCapability =
  | "smart_background"
  | "create-background"
  | "image_edit"
  | "edit"
  | "background_removal"
  | "remove-background"
  | "image_enhance"
  | "enhance"
  | "watermark_removal"
  | "remove-watermark"
  | "image_erase"
  | "erase"
  | "image_expansion"
  | "expand"
  | "text_to_image";

const BACKGROUND_IMAGE_TASK_CAPABILITIES = new Set<BackgroundImageTaskCapability>([
  "smart_background",
  "create-background",
  "image_edit",
  "edit",
  "background_removal",
  "remove-background",
  "image_enhance",
  "enhance",
  "watermark_removal",
  "remove-watermark",
  "image_erase",
  "erase",
  "image_expansion",
  "expand",
  "text_to_image",
]);

export function resolveBackgroundImageTaskCapability(input: Record<string, unknown>): BackgroundImageTaskCapability {
  const raw = typeof input.capability === "string" && input.capability.trim()
    ? input.capability.trim()
    : "text_to_image";
  if (!BACKGROUND_IMAGE_TASK_CAPABILITIES.has(raw as BackgroundImageTaskCapability)) {
    throw new Error("Unsupported background image task capability");
  }
  return raw as BackgroundImageTaskCapability;
}
