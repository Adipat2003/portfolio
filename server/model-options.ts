/** GLM-5.3 always reasons, and its output limit includes reasoning tokens. */
export function modelRequestOptions(model: string, answerTokens: number) {
  return /glm-5\.3/i.test(model)
    ? { max_tokens: 4096, reasoning_effort: "low", chat_template_kwargs: { reasoning_effort: "low", clear_thinking: true } }
    : { max_tokens: answerTokens };
}
