// @ts-check
import { OpenAICompatibleChatLanguageModel } from "@ai-sdk/openai-compatible";

/** Read the deployment secret only when making a request, never during discovery. */
const codingHeaders = () => {
  const key = process.env.ZAI_CODING_API_KEY;
  if (!key) throw new Error("ZAI_CODING_API_KEY is required for the factory's Z.ai model.");
  return { Authorization: `Bearer ${key}` };
};

/**
 * Use the Coding Plan endpoint directly; Gateway BYOK uses the separately billed Model API.
 * The optional endpoint is for local HTTP integration fixtures, not deployment configuration.
 * @param {string} modelId
 * @param {string} [baseURL]
 */
export const createZaiModel = (modelId, baseURL = "https://api.z.ai/api/coding/paas/v4") =>
  new OpenAICompatibleChatLanguageModel(modelId, {
    headers: codingHeaders,
    includeUsage: true,
    provider: "zai.chat",
    url: ({ path }) => `${baseURL}${path}`,
  });
