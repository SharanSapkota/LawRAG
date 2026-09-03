import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { prisma } from "@repo/database";
import OpenAI from "openai";
import { EMBEDDING_SERVICE, type EmbeddingService } from "../embedding/embedding.service";
import { LawDocumentChunkRepository } from "../documents/law-document-chunk.repository";
import { isPredominantlyDevanagari } from "../translation/language.util";

// CHAT_PROVIDER=openai / OPENAI_CHAT_MODEL=gpt-4o-mini were set in
// apps/api/.env ahead of this task — treated as O1 (LLM provider) already
// resolved to OpenAI, not Anthropic. CLAUDE.md itself says "Anthropic API
// (or configured LLM)", so this isn't a contradiction, just the configured
// choice.
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

const BASE_SYSTEM_PROMPT =
  "You are a legal assistant for a Nepali law firm. Answer the user's question " +
  "using ONLY the law excerpts provided below, plus any attached document text. " +
  "When you rely on a specific excerpt, cite it by its section reference exactly " +
  "as given. If the excerpts don't contain enough information to answer, say so " +
  "honestly rather than guessing or inventing a citation. The excerpts are in " +
  "English (translated from Nepali sources where applicable) regardless of what " +
  "language they were originally in.";

// Leaving language-matching to the model's own inference from the prompt
// text alone proved unreliable in testing (an English question got a
// Nepali answer, likely because the context block's sectionRef labels
// are still in Nepali even though chunk content is English) — so the
// query's language is detected programmatically (same Devanagari check
// used for chunks during processing) and given as an explicit,
// unambiguous directive instead of an inferable instruction.
function buildSystemPrompt(userMessage: string): string {
  const directive = isPredominantlyDevanagari(userMessage)
    ? "The user's question is in Nepali. You MUST respond entirely in Nepali (Devanagari script), regardless of what language the excerpts or citations are in."
    : "The user's question is in English. You MUST respond entirely in English, regardless of what language the excerpts or citations are in.";

  return `${BASE_SYSTEM_PROMPT}\n\n${directive}`;
}

export interface RetrievedSource {
  sectionRef: string | null;
  documentTitle: string;
}

export interface GenerateResponseInput {
  userMessage: string;
  pdfContext?: string;
}

export interface GenerateResponseResult {
  content: string;
  sources: RetrievedSource[];
}

export interface AiService {
  generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult>;
}

export const AI_SERVICE = Symbol("AI_SERVICE");

@Injectable()
export class OpenAiAiService implements AiService {
  private readonly client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  constructor(
    @Inject(EMBEDDING_SERVICE) private readonly embeddingService: EmbeddingService,
    private readonly chunkRepository: LawDocumentChunkRepository,
  ) {}

  async generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult> {
    const queryEmbedding = await this.embeddingService.embed(input.userMessage);
    const chunks = await this.chunkRepository.findSimilarChunks(prisma, queryEmbedding);

    const contextBlock =
      chunks.length > 0
        ? chunks
            .map(
              (chunk) =>
                `[${chunk.sectionRef ?? "unspecified section"}] (from "${chunk.documentTitle}"):\n${chunk.content}`,
            )
            .join("\n\n")
        : "No relevant published law excerpts were found for this question.";

    const userContent = [
      `Relevant law excerpts:\n${contextBlock}`,
      input.pdfContext ? `Attached document text:\n${input.pdfContext}` : null,
      `User question: ${input.userMessage}`,
    ]
      .filter((part): part is string => Boolean(part))
      .join("\n\n");

    let completion: OpenAI.Chat.Completions.ChatCompletion;

    try {
      completion = await this.client.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt(input.userMessage) },
          { role: "user", content: userContent },
        ],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`OpenAI chat completion failed: ${message}`);
    }

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new InternalServerErrorException("OpenAI returned an empty chat completion");
    }

    return {
      content,
      sources: chunks.map((chunk) => ({
        sectionRef: chunk.sectionRef,
        documentTitle: chunk.documentTitle,
      })),
    };
  }
}
