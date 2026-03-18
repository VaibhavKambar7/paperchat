import BM25 from "bm25";

export function generateSparseVector(
  text: string,
  bm25: BM25,
): { indices: number[]; values: number[] } | undefined {
  const tokens = bm25.tokenize(text);
  const indices: number[] = [];
  const values: number[] = [];

  const uniqueTokens = Array.from(new Set(tokens));
  uniqueTokens.forEach((token) => {
    const termId = bm25.terms[token];
    if (termId !== undefined) {
      const termFreq = tokens.filter((t: string) => t === token).length;
      const tf = termFreq / tokens.length;
      const idf = bm25.idf[token] || 1;

      indices.push(termId);
      values.push(tf * idf);
    }
  });

  return indices.length > 0 ? { indices, values } : undefined;
}
