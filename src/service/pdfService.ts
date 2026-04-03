import {
  LlamaParseReader,
  Document as LlamaDocument,
  MarkdownNodeParser,
  MetadataMode,
  SentenceSplitter,
} from "llamaindex";
import { getEmbeddingPipeline } from "@/app/utils/getEmbeddingPipeline";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { estimateTokenCount } from "@/app/utils/estimateTokens";
import { requireEnv } from "@/lib/env";
// import { execSync } from "child_process";

dotenv.config();

const LLAMA_API_KEY = requireEnv("LLAMA_CLOUD_API_KEY");

export type ChunkType = {
  id: string;
  text: string;
  metadata: {
    totalPages?: number;
    chunkIndex: string;
    context: string;
    sectionTitle?: string;
    pageNumber?: number;
  };
  embedding?: number[];
};

export interface PageContent {
  text: string;
  pageNumber: number;
}

export interface PreChunk {
  text: string;
  metadata: {
    pageNumber: number;
    totalPages: number;
  };
}

export const extractTextFromPDF = async (pdfBuffer: Buffer) => {
  try {
    const tempDir = path.join(process.cwd(), "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    const tempFilePath = path.join(tempDir, `temp-${Date.now()}.pdf`);
    fs.writeFileSync(tempFilePath, pdfBuffer);

    /*
    const pythonPath = "./scripts/chatcore/bin/python3";
    
    const ocrOutput = execSync(
    `${pythonPath} ./scripts/ocr.py "${tempFilePath}"`,
    ).toString();
    fs.unlinkSync(tempFilePath);
    
    const rawPages = ocrOutput.split(/=== PAGE \d+ ===/).filter(Boolean);
    
    const pagesData: PageContent[] = [];
    let fullTextForTokenCount = "";
    
    for (let i = 0; i < rawPages.length; i++) {
    const text = rawPages[i].trim();
    const pageNumber = i + 1;
    
    pagesData.push({ text, pageNumber });
    fullTextForTokenCount += text + "\n\n";
    }
    
    const tokenCount = estimateTokenCount(fullTextForTokenCount);
    
    return {
    pagesData,
    totalPages: rawPages.length,
    tokenCount,
    rawExtractedText: fullTextForTokenCount.trim(),
    };
    */

    const reader = new LlamaParseReader({
      resultType: "markdown",
      apiKey: LLAMA_API_KEY,
    });

    const documents: LlamaDocument[] = await reader.loadData(tempFilePath);
    fs.unlinkSync(tempFilePath);

    const pagesData: PageContent[] = [];
    let fullTextForTokenCount = "";

    for (const doc of documents) {
      let pageNumber = -1;
      const idPageMatch = doc.id_?.match(/_(\d+)$/);
      if (idPageMatch && idPageMatch[1]) {
        pageNumber = parseInt(idPageMatch[1], 10);
      } else if (doc.metadata?.page_label) {
        pageNumber = parseInt(String(doc.metadata.page_label), 10);
      } else {
        console.warn(
          `Could not reliably determine page number for doc id: ${doc.id_}. Check LlamaParse output structure. Using sequential as fallback.`,
        );
        pageNumber = pagesData.length + 1;
      }

      pagesData.push({ text: doc.text, pageNumber });
      fullTextForTokenCount += doc.text + "\n\n";
    }

    pagesData.sort((a, b) => a.pageNumber - b.pageNumber);

    const tokenCount = estimateTokenCount(fullTextForTokenCount);

    return {
      pagesData,
      totalPages: documents.length,
      tokenCount,
      rawExtractedText: fullTextForTokenCount.trim(),
      llamaDocuments: documents,
    };
  } catch (error) {
    console.error("Error extracting text from PDF with LlamaParse:", error);
    throw new Error("Failed to process the PDF file.");
  }
};

export const chunkLlamaDocuments = async (
  documents: LlamaDocument[],
): Promise<ChunkType[]> => {
  if (documents.length === 0) return [];

  const parser = new MarkdownNodeParser();
  const mdNodes = await parser.getNodesFromDocuments(documents);

  const splitter = new SentenceSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const nodes = await splitter.getNodesFromDocuments(mdNodes);

  const chunks: ChunkType[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const text = node.getContent(MetadataMode.NONE).trim();
    if (!text) continue;

    let pageNumber = -1;
    if (node.metadata?.page_label) {
      pageNumber = parseInt(String(node.metadata.page_label), 10);
    }

    const headerPath = Object.entries(node.metadata)
      .filter(([key]) => key.startsWith("Header_"))
      .sort()
      .map(([, value]) => value)
      .join(" > ");

    chunks.push({
      id: node.id_,
      text: text,
      metadata: {
        chunkIndex: String(i),
        pageNumber: pageNumber > 0 ? pageNumber : undefined,
        sectionTitle: headerPath || undefined,
        context: headerPath ? `Section: ${headerPath}` : "",
      },
    });
  }

  return chunks;
};

export const embedChunks = async (chunkOutputs: ChunkType[]) => {
  const embeddingPipeline = await getEmbeddingPipeline();

  return await Promise.all(
    chunkOutputs.map(async (chunk) => {
      const textToEmbed = chunk.metadata.context
        ? `${chunk.metadata.context} ${chunk.text}`
        : chunk.text;

      const output = await embeddingPipeline(textToEmbed, {
        pooling: "mean",
        normalize: true,
      });

      return {
        id: chunk.id,
        text: chunk.text,
        metadata: chunk.metadata,
        embedding: Array.from(output.data) as number[],
      };
    }),
  );
};
