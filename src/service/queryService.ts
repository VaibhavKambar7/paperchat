import { getEmbeddingPipeline } from "@/app/utils/getEmbeddingPipeline";
import { index } from "./uploadService";
import BM25 from "bm25";
import { generateSparseVector } from "@/app/utils/bm25";

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
      topK: 5,
      vector: queryEmbedding,
      sparseVector,
      includeValues: false,
      includeMetadata: true,
    });

    console.log("Pinecone response matches:", response.matches);

    console.log(
      "Pinecone response matches:",
      JSON.stringify(response.matches, null, 2),
    );

    if (response.matches && response.matches.length > 0) {
      const formattedContext = response.matches
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
