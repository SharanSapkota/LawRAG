import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { prisma, MessageRole } from "@repo/database";
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
  "using ONLY the law excerpts provided below, plus any attached document text " +
  "and the prior conversation. When you rely on a specific excerpt, cite it by " +
  "its section reference exactly as given. If the excerpts don't contain enough " +
  "information to answer, say so honestly rather than guessing or inventing a " +
  "citation. The excerpts are in English (translated from Nepali sources where " +
  "applicable) regardless of what language they were originally in.\n\n" +
  "The user may also ask you to change HOW you answer rather than asking a new " +
  "legal question — e.g. 'explain that in simple English', 'answer in Nepali " +
  "instead', 'make it shorter'. When that happens, apply the requested language, " +
  "tone, or simplicity level to your answer, using the prior conversation to know " +
  "what content it should still be about. An explicit instruction like this always " +
  "takes priority over the default language directive below.";

// Detected language is the DEFAULT, not an absolute override: if isDevanagari
// is auto-detected wrong (or the user is asking to switch language as an
// explicit instruction, e.g. a Nepali message asking to be answered in
// English), the BASE_SYSTEM_PROMPT above tells the model that explicit
// instructions win. Leaving language-matching to pure inference proved
// unreliable in testing without any directive at all, so this still gives
// an unambiguous default — it just isn't allowed to clobber an explicit ask.
function buildSystemPrompt(userMessage: string): string {
  const directive = isPredominantlyDevanagari(userMessage)
    ? "Default: the user's question is in Nepali, so respond in Nepali (Devanagari script) unless they've explicitly asked for another language."
    : "Default: the user's question is in English, so respond in English unless they've explicitly asked for another language.";

  return `${BASE_SYSTEM_PROMPT}\n\n${directive}`;
}

export interface RetrievedSource {
  sectionRef: string | null;
  documentTitle: string;
}

export interface ConversationTurn {
  role: MessageRole;
  content: string;
}

export interface GenerateResponseInput {
  userMessage: string;
  pdfContext?: string;
  // Prior turns for this session, oldest first. Does NOT include the
  // current `userMessage` — that's passed separately. Empty/omitted on a
  // session's first message.
  history?: ConversationTurn[];
}

export interface GenerateResponseResult {
  content: string;
  sources: RetrievedSource[];
}

export interface AiService {
  generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult>;
}

export const AI_SERVICE = Symbol("AI_SERVICE");

function toOpenAiRole(role: MessageRole): "user" | "assistant" {
  return role === MessageRole.ASSISTANT ? "assistant" : "user";
}

@Injectable()
export class OpenAiAiService implements AiService {
  private readonly client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  constructor(
    @Inject(EMBEDDING_SERVICE) private readonly embeddingService: EmbeddingService,
    private readonly chunkRepository: LawDocumentChunkRepository,
  ) {}

  /**
   * Rewrites a follow-up message into a standalone query before it's
   * embedded for retrieval. Without this, a follow-up like "what if the
   * injury is fatal?" or "explain that in simple English" gets embedded
   * on its own — with no idea what "that"/"the injury" refers to — and
   * retrieval quality degrades badly. Skipped entirely on a session's
   * first message (nothing to resolve against yet), so the common case
   * costs nothing extra.
   *
   * For a pure tone/language/formatting instruction with no new legal
   * content ("say that more simply"), this resolves back to the
   * underlying question being discussed, since that's what still needs
   * to be retrieved against — the instruction itself is handled later by
   * the system prompt, not by retrieval.
   */
  private async condenseQuery(userMessage: string, history: ConversationTurn[]): Promise<string> {
    if (history.length === 0) {
      return userMessage;
    }

    const transcript = history
      .map((turn) => `${turn.role === MessageRole.ASSISTANT ? "Assistant" : "User"}: ${turn.content}`)
      .join("\n");

    try {
      const completion = await this.client.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Given a conversation and a follow-up message, rewrite the follow-up as a " +
              "single standalone question or request that captures its full intent, " +
              "resolving pronouns and references to earlier turns. If the follow-up is " +
              "only a tone/language/formatting instruction (e.g. 'explain simpler', " +
              "'answer in English') rather than a new question, rewrite it as a " +
              "standalone version of the underlying question the conversation was " +
              "already about. Reply with ONLY the rewritten text, nothing else.",
          },
          {
            role: "user",
            content: `Conversation so far:\n${transcript}\n\nFollow-up message: ${userMessage}\n\nStandalone rewrite:`,
          },
        ],
      });

      const rewritten = completion.choices[0]?.message?.content?.trim();
      return rewritten || userMessage;
    } catch {
      // Retrieval quality degrades, but the request shouldn't hard-fail
      // just because the condense step failed — fall back to the raw
      // follow-up text.
      return userMessage;
    }
  }

  async generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult> {
    const history = input.history ?? [];

    const retrievalQuery = await this.condenseQuery(input.userMessage, history);
    const queryEmbedding = await this.embeddingService.embed(retrievalQuery);
    // findSimilarChunks searches BOTH the English and Nepali embedding
    // columns internally and merges results — the query embedding itself
    // doesn't need to be translated to match; see law-document-chunk.repository.ts.
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

    const currentTurnContent = [
      `Relevant law excerpts:\n${contextBlock}`,
      input.pdfContext ? `Attached document text:\n${input.pdfContext}` : null,
      `User question: ${input.userMessage}`,
    ]
      .filter((part): part is string => Boolean(part))
      .join("\n\n");

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: buildSystemPrompt(input.userMessage) },
      // Prior turns as real conversation history, not flattened into one
      // string — this is what gives the model actual memory of what was
      // already said, separately from the retrieval-condensing above.
      ...history.map((turn) => ({
        role: toOpenAiRole(turn.role),
        content: turn.content,
      })),
      { role: "user", content: currentTurnContent },
    ];

    let completion: OpenAI.Chat.Completions.ChatCompletion;

    try {
      completion = await this.client.chat.completions.create({
        model: CHAT_MODEL,
        messages,
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