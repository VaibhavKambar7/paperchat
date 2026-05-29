import { pipeline } from "@xenova/transformers";
export const EMBEDDING_MODEL_NAME = "Xenova/all-mpnet-base-v2";

let embeddingPipelineInstance: any = null;

export async function getEmbeddingPipeline() {
  if (!embeddingPipelineInstance) {
    console.log(`Initializing embedding pipeline: ${EMBEDDING_MODEL_NAME}`);
    embeddingPipelineInstance = await pipeline(
      "feature-extraction",
      EMBEDDING_MODEL_NAME,
    );
    console.log(`Embedding pipeline initialized: ${EMBEDDING_MODEL_NAME}`);
  }
  return embeddingPipelineInstance;
}
