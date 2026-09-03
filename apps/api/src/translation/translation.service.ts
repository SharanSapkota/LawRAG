import { Injectable, InternalServerErrorException } from "@nestjs/common";
import OpenAI from "openai";

// Same model/provider already used for chat (ai.service.ts) — no new
// provider added for translation, just another prompted call to OpenAI.
const TRANSLATION_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

const SYSTEM_PROMPT =
  "You are a precise legal translator. Translate the given Nepali legal " +
  "text into English. Preserve section/clause markers (e.g. 'दफा १२' -> " +
  "'Section 12') and numbering exactly as given. Do not summarize, " +
  "explain, or add commentary — output only the translated text.";

export interface TranslationService {
  translateToEnglish(nepaliText: string): Promise<string>;
}

export const TRANSLATION_SERVICE = Symbol("TRANSLATION_SERVICE");

@Injectable()
export class OpenAiTranslationService implements TranslationService {
  private readonly client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  async translateToEnglish(nepaliText: string): Promise<string> {
    let completion: OpenAI.Chat.Completions.ChatCompletion;

    try {
      completion = await this.client.chat.completions.create({
        model: TRANSLATION_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: nepaliText },
        ],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`OpenAI translation request failed: ${message}`);
    }

    const translated = completion.choices[0]?.message?.content;

    if (!translated) {
      throw new InternalServerErrorException("OpenAI returned an empty translation");
    }

    return translated;
  }
}
