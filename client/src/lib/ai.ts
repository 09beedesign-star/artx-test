type LLMRole = "system" | "user" | "assistant";

export type LLMMessage = {
  role: LLMRole;
  content: string;
};

export async function callLLM({
  prompt,
  messages,
  model,
  module,
}: {
  prompt?: string;
  messages?: LLMMessage[];
  model?: string;
  module: string;
}) {
  const response = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, messages, model, module }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "AI 请求失败");
  }

  return result as { text: string; model: string };
}
