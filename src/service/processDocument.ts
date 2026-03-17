import nlp from "compromise";
import prisma from "@/lib/prisma";
import { MAX_TOKEN_THRESHOLD } from "@/app/utils/constants";
import {
  ChunkType,
  chunkLlamaDocuments,
  embedChunks,
  extractTextFromPDF,
} from "@/service/pdfService";
import { upsertData } from "@/service/uploadService";

type ProcessDocumentInput = {
  documentId: string;
  pdfBuffer: Buffer;
};

type ProcessDocumentResult = {
  message: string;
  text: string;
  tokenCount: number;
  chunksCount: number;
  documentId: string;
  embeddingsProcessed: boolean;
};

export async function processDocument({
  documentId,
  pdfBuffer,
}: ProcessDocumentInput): Promise<ProcessDocumentResult> {
  const {
    pagesData,
    totalPages,
    tokenCount,
    rawExtractedText,
    llamaDocuments,
  } = await extractTextFromPDF(pdfBuffer);

  let allFinalChunks: ChunkType[] = [];
  let embeddingsProcessed = false;

  if (tokenCount > MAX_TOKEN_THRESHOLD && llamaDocuments) {
    allFinalChunks = await chunkLlamaDocuments(llamaDocuments);

    allFinalChunks = allFinalChunks.filter(
      (chunk) => chunk.text.trim().length > 0,
    );

    allFinalChunks = allFinalChunks.map((chunk, idx) => ({
      ...chunk,
      id: `chunk-${documentId}-${idx}`,
      metadata: {
        ...chunk.metadata,
        chunkIndex: String(idx),
      },
    }));

    if (allFinalChunks.length > 0) {
      const embeddedChunks = await embedChunks(allFinalChunks);
      await upsertData(embeddedChunks, documentId);
      embeddingsProcessed = true;
    }
  }

  await prisma.document.update({
    where: { slug: documentId },
    data: {
      extractedText: rawExtractedText,
      embeddingsGenerated: embeddingsProcessed,
    },
  });

  let message = `Document ${documentId} extracted (${totalPages} pages, ${tokenCount} tokens). Token count is below threshold, so chunking and embedding were skipped.`;

  if (embeddingsProcessed) {
    message = `Document ${documentId} processed successfully. Extracted ${totalPages} pages, ${allFinalChunks.length} chunks, estimated ${tokenCount} tokens. Embeddings stored.`;
  } else if (tokenCount > MAX_TOKEN_THRESHOLD && allFinalChunks.length === 0) {
    message = `Document ${documentId} extracted (${totalPages} pages, ${tokenCount} tokens), but no chunks were generated for embedding (might be too sparse).`;
  }

  return {
    message,
    text: rawExtractedText,
    tokenCount,
    chunksCount: allFinalChunks.length,
    documentId,
    embeddingsProcessed,
  };
}
