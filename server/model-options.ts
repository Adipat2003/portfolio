/** GLM-5.3 always reasons, and its output limit includes reasoning tokens. */
export function modelRequestOptions(model: string, answerTokens: number) {
  if (model === "nvidia/nemotron-3.5-lightning-30b-a3b") return { max_tokens: answerTokens, chat_template_kwargs: { enable_thinking: false } };
  return /glm-5\.3/i.test(model)
    ? { max_tokens: 4096, reasoning_effort: "low", chat_template_kwargs: { reasoning_effort: "low", clear_thinking: true } }
    : { max_tokens: answerTokens };
}
