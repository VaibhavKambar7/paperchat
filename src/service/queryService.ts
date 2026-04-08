import { getEmbeddingPipeline } from "@/app/utils/getEmbeddingPipeline";
import { index } from "./uploadService";
import BM25 from "bm25";
import { generateSparseVector } from "@/app/utils/bm25";
import { CohereClient } from "cohere-ai";
import {
  RecordMetadata,
  ScoredPineconeRecord,
} from "@pinecone-database/pinecone";
import { getEnvFloat } from "@/lib/env";

const RAG_MIN_RETRIEVAL_SCORE = getEnvFloat(
  "RAG_MIN_RETRIEVAL_SCORE",
  0,
  -1,
);

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

export type RetrievalDebugChunk = {
  id: string;
  score?: number;
  pageNumber?: number;
  preview: string;
};

export type QueryDBDebug = {
  initialMatchCount: number;
  finalMatchCount: number;
  scoreFilteredMatchCount: number;
  dedupedMatchCount: number;
  minScoreThreshold: number;
  rerankUsed: boolean;
  chunks: RetrievalDebugChunk[];
};

export type QueryDBResult = {
  context: string;
  debug: QueryDBDebug;
};

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
  const result = await queryDBDetailed(query, slug, sectionTitle);
  return result.context;
};

export const queryDBDetailed = async (
  query: string,
  slug: string,
  sectionTitle?: string,
): Promise<QueryDBResult> => {
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
      let rerankUsed = false;

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
          rerankUsed = true;
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

      const scoreFilteredMatches = finalMatches.filter((match) => {
        if (typeof match.score !== "number") return true;
        return match.score >= RAG_MIN_RETRIEVAL_SCORE;
      });

      const uniqueMatches = dedupeMatches(scoreFilteredMatches);

      if (uniqueMatches.length === 0) {
        return {
          context: "No matching results found to construct context.",
          debug: {
            initialMatchCount: response.matches.length,
            finalMatchCount: finalMatches.length,
            scoreFilteredMatchCount: scoreFilteredMatches.length,
            dedupedMatchCount: 0,
            minScoreThreshold: RAG_MIN_RETRIEVAL_SCORE,
            rerankUsed,
            chunks: [],
          },
        };
      }

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

      return {
        context: formattedContext,
        debug: {
          initialMatchCount: response.matches.length,
          finalMatchCount: finalMatches.length,
          scoreFilteredMatchCount: scoreFilteredMatches.length,
          dedupedMatchCount: uniqueMatches.length,
          minScoreThreshold: RAG_MIN_RETRIEVAL_SCORE,
          rerankUsed,
          chunks: uniqueMatches.map((match) => ({
            id: match.id,
            score: match.score,
            pageNumber: match.metadata?.pageNumber as number | undefined,
            preview: String(match.metadata?.text ?? "").slice(0, 160),
          })),
        },
      };
    }

    return {
      context: "No matching results found to construct context.",
      debug: {
        initialMatchCount: 0,
        finalMatchCount: 0,
        scoreFilteredMatchCount: 0,
        dedupedMatchCount: 0,
        minScoreThreshold: RAG_MIN_RETRIEVAL_SCORE,
        rerankUsed: false,
        chunks: [],
      },
    };
  } catch (error) {
    console.error("Error querying database:", error);
    throw new Error(
      `Error querying database: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
