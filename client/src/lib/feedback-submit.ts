export type FeedbackAttachmentPayload = {
  name: string;
  src: string;
};

export type SubmitUserFeedbackInput = {
  token: string;
  content: string;
  module: string;
  attachments: FeedbackAttachmentPayload[];
};

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

export async function submitUserFeedback(input: SubmitUserFeedbackInput) {
  if (!input.token) throw new Error("请先登录后再提交反馈");
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.token}`,
    },
    body: JSON.stringify({
      content: input.content,
      module: input.module,
      attachments: input.attachments,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : "反馈提交失败");
  }
  return result;
}
