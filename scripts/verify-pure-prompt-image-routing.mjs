const { routeCreativeIntent } = await import("../client/src/lib/ai-intent.ts");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const pureImagePrompts = [
  "一个小白兔",
  "输入一个小白兔",
  "画一个小白兔",
  "生成一只小白兔",
];

for (const prompt of pureImagePrompts) {
  const decision = await routeCreativeIntent({
    module: "verify-pure-prompt-image-routing",
    prompt,
    allowReferenceSearch: true,
  });
  assert(
    decision.mode === "image",
    `${prompt} should route to image, got ${decision.mode}`
  );
  assert(
    decision.imagePrompt === prompt,
    `${prompt} should keep the original image prompt`
  );
}

const referenceDecision = await routeCreativeIntent({
  module: "verify-pure-prompt-image-routing",
  prompt: "帮我找小白兔参考图",
  allowReferenceSearch: true,
});

assert(
  referenceDecision.mode === "reference_search",
  `explicit reference request should route to reference_search, got ${referenceDecision.mode}`
);

console.log("pure prompt image routing ok");
