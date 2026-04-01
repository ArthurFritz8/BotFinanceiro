import {
  OpenRouterChatAdapter,
  type OpenRouterChatCompletion,
} from "../../../integrations/ai/openrouter-chat-adapter.js";

export interface CopilotChatInput {
  maxTokens?: number;
  message: string;
  systemPrompt?: string;
  temperature?: number;
}

const openRouterChatAdapter = new OpenRouterChatAdapter();

export class CopilotChatService {
  public async chat(input: CopilotChatInput): Promise<OpenRouterChatCompletion> {
    return openRouterChatAdapter.createCompletion(input);
  }
}