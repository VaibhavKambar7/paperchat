import prisma from "@/lib/prisma";
import { webSearch, TavilySnippet } from "@/app/utils/web-search";
import {
  ChatHistory,
  generateContextualLLMResponseStream,
  generatePureLLMResponseStream,
} from "@/service/llmService";
import { queryDB } from "@/service/queryService";

type AnswerQuestionInput = {
  query: string;
  documentId: string;
  history?: ChatHistory;
  onChunk: (chunk: string) => void;
  useWebSearch?: boolean;
};

const NO_MATCHING_RESULTS = "No matching results found to construct context.";

function buildWebSearchContext(snippets: TavilySnippet[], answer?: string) {
  const snippetBlock =
    snippets.length > 0
      ? snippets
          .map(
            (snippet, index) =>
              `[Snippet ${index + 1}] [${snippet.title}](${snippet.url})\n${snippet.content}`,
          )
          .join("\n\n")
      : "No additional web search results found.";

  return `WEB-SEARCH ANSWER:\n${answer ?? ""}\n\n${snippetBlock}`;
}

export async function answerQuestion({
  query,
  documentId,
  history = [],
  onChunk,
  useWebSearch = false,
}: AnswerQuestionInput): Promise<{ response: string; chatHistory: ChatHistory }> {
  const document = await prisma.document.findUnique({
    where: { slug: documentId },
    select: {
      extractedText: true,
      embeddingsGenerated: true,
      chatHistory: true,
    },
  });

  if (!document) {
    throw new Error(`Document with ID ${documentId} not found.`);
  }

  const chatHistory = ((document.chatHistory as ChatHistory) || history).filter(
    Boolean,
  ) as ChatHistory;
  let response = "";

  const collectChunk = (chunk: string) => {
    response += chunk;
    onChunk(chunk);
  };

  let context = "";

  if (document.embeddingsGenerated) {
    const retrievedContext = await queryDB(query, documentId);
    const hasRetrievedContext =
      retrievedContext.trim().length > 0 &&
      retrievedContext !== NO_MATCHING_RESULTS;

    if (hasRetrievedContext) {
      const contextParts = [`DOCUMENT EXTRACTS:\n${retrievedContext}`];

      if (useWebSearch) {
        try {
          const webResult = await webSearch(query);
          contextParts.push(
            buildWebSearchContext(webResult.snippets ?? [], webResult.answer),
          );
        } catch (error) {
          console.error("Web search failed:", error);
        }
      }

      context = contextParts.join("\n\n");
    }
  }

  if (context) {
    await generateContextualLLMResponseStream(
      query,
      context,
      chatHistory,
      collectChunk,
    );
  } else {
    await generatePureLLMResponseStream(
      query,
      document.extractedText ||
        "No document text available to answer this question from the document.",
      chatHistory,
      collectChunk,
    );
  }

  const updatedHistory = [
    ...chatHistory,
    { role: "user", content: query },
    { role: "assistant", content: response },
  ] as ChatHistory;

  await prisma.document.update({
    where: { slug: documentId },
    data: { chatHistory: updatedHistory },
  });

  return { response, chatHistory: updatedHistory };
}
