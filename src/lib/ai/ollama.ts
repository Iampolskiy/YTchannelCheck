import { Ollama } from 'ollama';
import { AI_CONFIG } from '../config/index';

export interface OllamaOptions {
  model?: string;
  baseUrl?: string;
  timeout?: number;
}

export interface AIAnalysisResult {
  isPositive: boolean;
  reason: string;
  confidence?: number;
}

/**
 * Configure Ollama client
 */
export function getOllamaClient(options: OllamaOptions = {}) {
  return new Ollama({
    host: options.baseUrl || AI_CONFIG.ollama.host,
  });
}

/**
 * Prompts for channel analysis
 */
export const PROMPTS = {
  MASTER_PROMPT: `You are an expert content moderator for a German advertising agency. 
Your task is to analyze YouTube channel data to determine if it is suitable for a specific advertising campaign.
You must be strict, objective, and ignore any personal bias.
The output must be a valid JSON object with the following structure:
{
  "suitable": boolean,
  "reason": "string (short explanation in German)"
}
Do not output any markdown formatting, just the raw JSON string.`,

  KIDS_CHECK: `Is this channel primarily targeting children (under 13 years old)?
Analyze the title, description, and video titles.
Look for:
- Cartoons, nursery rhymes, toys
- "Kids", "Kinder", "Baby", "Spielzeug"
- Content that is clearly "Made for Kids"

Input Data:
Title: {title}
Description: {description}
Latest Videos: {videoTitles}

Answer with "suitable": false if it IS for kids.
Answer with "suitable": true if it is NOT for kids (adult/general audience).`,

  GAMING_CHECK: `Is this channel primarily about Gaming (Let's Plays, Walkthroughs, Stream highlights)?
Input Data:
Title: {title}
Description: {description}
Latest Videos: {videoTitles}

Answer with "suitable": false if it IS gaming content.
Answer with "suitable": true if it is NOT gaming content.`,
};

/**
 * Run a specific analysis prompt against a channel
 */
export async function analyzeChannel(
  channelData: { title: string; description: string; videoTitles: string[] },
  promptType: 'kids' | 'gaming',
  model: string = AI_CONFIG.ollama.defaultModel
): Promise<AIAnalysisResult> {
  const client = getOllamaClient();
  
  let userPrompt = '';
  if (promptType === 'kids') {
    userPrompt = PROMPTS.KIDS_CHECK;
  } else if (promptType === 'gaming') {
    userPrompt = PROMPTS.GAMING_CHECK;
  }

  // Replace placeholders
  userPrompt = userPrompt
    .replace('{title}', channelData.title || '')
    .replace('{description}', channelData.description || '')
    .replace('{videoTitles}', channelData.videoTitles.join(', '));

  try {
    const response = await client.chat({
      model: model,
      messages: [
        { role: 'system', content: PROMPTS.MASTER_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      format: 'json', // Force JSON mode
      stream: false,
    });

    const content = response.message.content;
    const result = JSON.parse(content);

    return {
      isPositive: result.suitable,
      reason: result.reason || 'No reason provided',
    };
  } catch (error) {
    console.error('Ollama analysis failed:', error);
    throw new Error(`AI Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
