import nlp from "compromise";
import prisma from "@/lib/prisma";
import { MAX_TOKEN_THRESHOLD } from "@/app/utils/constants";
import {
  ChunkType,
  chunkText,
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
  const { pagesData, totalPages, tokenCount, rawExtractedText } =
    await extractTextFromPDF(pdfBuffer);

  const allFinalChunks: ChunkType[] = [];
  let embeddingsProcessed = false;

  if (tokenCount > MAX_TOKEN_THRESHOLD) {
    let globalChunkIndexCounter = 0;

    for (const page of pagesData) {
      if (!page.text?.trim()) {
        continue;
      }

      const preChunks = await chunkText(page.text, totalPages, page.pageNumber);

      for (const preChunk of preChunks) {
        let previousSentence = "";

        if (allFinalChunks.length > 0) {
          const previousChunk = allFinalChunks[allFinalChunks.length - 1];
          const sentences =
            (nlp(previousChunk.text).sentences().out("array") as string[]) ||
            [];
          previousSentence = sentences[sentences.length - 1]?.trim() ?? "";
        }

        allFinalChunks.push({
          id: `chunk-${documentId}-${globalChunkIndexCounter}`,
          text: preChunk.text,
          metadata: {
            totalPages: preChunk.metadata.totalPages,
            pageNumber: preChunk.metadata.pageNumber,
            chunkIndex: `${globalChunkIndexCounter}`,
            context: previousSentence,
          },
        });

        globalChunkIndexCounter += 1;
      }
    }

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
