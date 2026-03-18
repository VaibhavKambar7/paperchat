// global.d.ts
declare module "compromise";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nlp = require("compromise");

declare module "bm25" {
  export default class BM25 {
    addDocument(text: string): void;
    updateIdf(): void;
    tokenize(text: string): string[];
    terms: Record<string, number>;
    idf: Record<string, number>;
  }
}
