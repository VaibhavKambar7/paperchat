import { getEmbeddingPipeline } from "@/app/utils/getEmbeddingPipeline";
import { index } from "./uploadService";
import BM25 from "bm25";
import { generateSparseVector } from "@/app/utils/bm25";
import { CohereClient } from "cohere-ai";
import {
  RecordMetadata,
  ScoredPineconeRecord,
} from "@pinecone-database/pinecone";

function normalizeChunkText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function dedupeMatches(matches: ScoredPineconeRecord<RecordMetadata>[]) {
  const seen = new Set<string>();
  const deduped: ScoredPineconeRecord<RecordMetadata>[] = [];

  for (const match of matches) {
    const text = String(match.metadata?.text ?? "");
    const page = String(match.metadata?.pageNumber ?? "");
    const identityKey = match.id || `${page}:${normalizeChunkText(text)}`;

    if (seen.has(identityKey)) continue;
    seen.add(identityKey);
    deduped.push(match);
  }

  return deduped;
}

async function embedQuery(query: string): Promise<number[]> {
  try {
    const embeddingPipeline = await getEmbeddingPipeline();

    const output = await embeddingPipeline(query, {
      pooling: "mean",
      normalize: true,
    });
    return Array.from(output.data) as number[];
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw new Error(`Failed to generate embedding: ${error}`);
  }
}

export const queryDB = async (
  query: string,
  slug: string,
  sectionTitle?: string,
): Promise<string> => {
  try {
    console.log("Query++++:", query);
    const queryEmbedding = await embedQuery(query);

    const bm25 = new BM25();
    bm25.addDocument(query);
    bm25.updateIdf();

    const sparseVector = generateSparseVector(query, bm25);

    const response = await index.namespace(slug).query({
      topK: 20,
      vector: queryEmbedding,
      sparseVector,
      includeValues: false,
      includeMetadata: true,
    });

    console.log("Pinecone response matches:", response.matches.length);

    if (response.matches && response.matches.length > 0) {
      let finalMatches = response.matches;

      if (process.env.COHERE_API_KEY) {
        try {
          console.log("Reranking with Cohere...");
          const cohere = new CohereClient({
            token: process.env.COHERE_API_KEY,
          });

          const docs = response.matches.map(
            (match) => (match.metadata?.text as string) || "No text available",
          );

          const rerankData = await cohere.rerank({
            model: "rerank-english-v3.0",
            query: query,
            documents: docs,
            topN: 5,
          });

          finalMatches = rerankData.results.map(
            (r: any) => response.matches[r.index],
          );
          console.log("Successfully reranked with Cohere.");
        } catch (e) {
          console.error(
            "Cohere reranking failed, falling back to Pinecone top 5.",
            e,
          );
          finalMatches = response.matches.slice(0, 5);
        }
      } else {
        console.warn(
          "COHERE_API_KEY is missing, falling back to standard Pinecone top 5.",
        );
        finalMatches = response.matches.slice(0, 5);
      }

      const uniqueMatches = dedupeMatches(finalMatches);

      const formattedContext = uniqueMatches
        .map((match) => {
          const text = (match.metadata?.text as string) || "No text available";
          const pageNumber = match.metadata?.pageNumber as number | undefined;

          let chunkString = "";
          chunkString += text;

          if (pageNumber !== undefined && pageNumber !== null) {
            return `[Source Page: ${pageNumber}]\n${chunkString}`;
          }
          return chunkString;
        })
        .join("\n\n---\n\n");

      console.log(
        "Formatted context for LLM:",
        JSON.stringify(formattedContext, null, 2),
      );
      return formattedContext;
    }

    return "No matching results found to construct context.";
  } catch (error) {
    console.error("Error querying database:", error);
    throw new Error(
      `Error querying database: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
