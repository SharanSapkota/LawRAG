import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma, DocumentStatus, type LawDocument } from "@repo/database";
import { EMBEDDING_SERVICE, type EmbeddingService } from "../embedding/embedding.service";
import { PdfExtractionService } from "../pdf/pdf-extraction.service";
import { StorageService } from "../storage/storage.service";
import { isPredominantlyDevanagari } from "../translation/language.util";
import { TRANSLATION_SERVICE, type TranslationService } from "../translation/translation.service";
import { chunkText } from "./chunk-text.util";
import { LawDocumentChunkRepository } from "./law-document-chunk.repository";

const DOCUMENT_KEY_PREFIX = "law-documents";

export interface CreateDraftDocumentInput {
  categoryId: string;
  title?: string;
  sourceRef?: string;
  file: Express.Multer.File;
}

export interface DocumentListItem {
  id: string;
  title: string;
  status: string;
  fileName: string | null;
  createdAt: Date;
  category: { id: string; name: string } | null;
  chunkCount: number;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly storageService: StorageService,
    private readonly pdfExtractionService: PdfExtractionService,
    private readonly chunkRepository: LawDocumentChunkRepository,
    @Inject(EMBEDDING_SERVICE) private readonly embeddingService: EmbeddingService,
    @Inject(TRANSLATION_SERVICE) private readonly translationService: TranslationService,
  ) {}

  /**
   * Upload only: saves the file to R2, creates the LawDocument row as
   * DRAFT, and returns immediately. No chunking/embedding here — that's a
   * deliberate separate step (processDocument), per CLAUDE.md's
   * DRAFT -> chunk -> embed -> PUBLISHED flow.
   */
  async createDraftDocument(input: CreateDraftDocumentInput): Promise<LawDocument> {
    const category = await prisma.lawCategory.findUnique({ where: { id: input.categoryId } });

    if (!category) {
      throw new NotFoundException("Law category not found");
    }

    const { url } = await this.storageService.uploadFile({
      buffer: input.file.buffer,
      contentType: input.file.mimetype,
      fileName: input.file.originalname,
      keyPrefix: DOCUMENT_KEY_PREFIX,
    });

    return prisma.lawDocument.create({
      data: {
        categoryId: input.categoryId,
        title: input.title ?? input.file.originalname,
        sourceRef: input.sourceRef,
        status: DocumentStatus.DRAFT,
        fileUrl: url,
        fileName: input.file.originalname,
      },
    });
  }

  /**
   * Downloads the stored file, extracts text, chunks it, translates any
   * Nepali chunks to English, embeds each chunk, and replaces the
   * document's chunk set. Chunking happens BEFORE translation (not the
   * other way around) so each chunk's Nepali original and English
   * translation stay correctly paired — translating the whole document
   * first and then trying to re-align chunk boundaries against the
   * translated output would be a much harder, fragile matching problem.
   * Language is detected per chunk (not once for the whole document), so
   * a document that mixes Nepali and English sections is handled
   * correctly instead of all-or-nothing.
   *
   * Translation + embedding calls happen outside the transaction
   * (external I/O shouldn't hold a DB transaction open); the
   * delete-then-reinsert is atomic so a document's chunk set is never
   * observably empty mid-reprocess, and re-running this endpoint on the
   * same document is safe (replaces, doesn't duplicate).
   *
   * Both translation and embedding are sequential, not parallel: OpenAI
   * is a real rate-limited API, so firing every chunk concurrently risks
   * tripping rate limits on any document with more than a handful of
   * chunks. Sequential processing also means that if any call fails,
   * later chunks are never attempted (no wasted calls), and — since
   * everything must succeed before the transaction below ever opens —
   * zero database writes happen for this run: the request fails
   * atomically, and the document's existing chunk set (from any prior
   * successful /process call) is left completely untouched.
   */
  async processDocument(documentId: string): Promise<{ chunkCount: number }> {
    const document = await prisma.lawDocument.findUnique({ where: { id: documentId } });

    if (!document) {
      throw new NotFoundException("Law document not found");
    }

    const key = this.storageService.extractKeyFromUrl(document.fileUrl);
    const fileBuffer = await this.storageService.downloadFile(key);
    const extractedText = await this.pdfExtractionService.extractText(fileBuffer);
    const rawChunks = chunkText(extractedText);
    let processedCount = 0;
    for (const chunk of rawChunks) {
  processedCount++;
  console.log(`Processing chunk ${processedCount}/${rawChunks.length}`);
  // ...
}

    const preparedChunks: Array<{
      content: string;
      originalContent: string | null;
      sectionRef: string | null;
      embedding: number[];
    }> = [];

    for (const chunk of rawChunks) {
      let content = chunk.content;
      let originalContent: string | null = null;

      if (isPredominantlyDevanagari(chunk.content)) {
        originalContent = chunk.content;
        content = await this.translationService.translateToEnglish(chunk.content);
      }
      console.log('0000')

      const embedding = await this.embeddingService.embed(content);
      preparedChunks.push({ content, originalContent, sectionRef: chunk.sectionRef, embedding });
    }

    const chunkCount = await prisma.$transaction(async (tx) => {
      await this.chunkRepository.deleteAllForDocument(tx, documentId);
      console.log('0200')

      for (const chunk of preparedChunks) {
        console.log(`Inserting chunk for document ${documentId}: ${chunk.sectionRef ?? "no section ref"}`);
        await this.chunkRepository.insertChunk(tx, {
          documentId,
          content: chunk.content,
          originalContent: chunk.originalContent,
          sectionRef: chunk.sectionRef,
          embedding: chunk.embedding,
        });
        console.log(`Inserted chunk for document ${documentId}: ${chunk.sectionRef ?? "no section ref"}`);
      }

      return preparedChunks.length;
    },
  {
    timeout: 60 * 60 * 1000, // 1 hour
    maxWait: 60 * 1000,
  });
    console.log('0300')

    return { chunkCount };
  }

  async listDocuments(): Promise<DocumentListItem[]> {
    const documents = await prisma.lawDocument.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { chunks: true } },
      },
    });

    return documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      status: doc.status,
      fileName: doc.fileName,
      createdAt: doc.createdAt,
      category: doc.category,
      chunkCount: doc._count.chunks,
    }));
  }

  /**
   * Lets an admin fix a document's title — added specifically to recover
   * from a since-fixed bug where multer mis-decoded non-ASCII (Nepali)
   * filenames into mojibake before they ever reached this service. That
   * corruption is not algorithmically reversible once it's already
   * stored (some documents show replacement characters — actual bytes
   * were already lost upstream), so this gives admins a way to set the
   * correct title by hand.
   */
  async renameDocument(documentId: string, title: string): Promise<LawDocument> {
    const document = await prisma.lawDocument.findUnique({ where: { id: documentId } });

    if (!document) {
      throw new NotFoundException("Law document not found");
    }

    return prisma.lawDocument.update({
      where: { id: documentId },
      data: { title },
    });
  }

  async publishDocument(documentId: string): Promise<LawDocument> {
    const document = await prisma.lawDocument.findUnique({ where: { id: documentId } });

    if (!document) {
      throw new NotFoundException("Law document not found");
    }

    const chunkCount = await prisma.lawDocumentChunk.count({ where: { documentId } });

    if (chunkCount === 0) {
      throw new BadRequestException(
        "Cannot publish a document with no chunks — run /process first",
      );
    }

    return prisma.lawDocument.update({
      where: { id: documentId },
      data: { status: DocumentStatus.PUBLISHED },
    });
  }
}
