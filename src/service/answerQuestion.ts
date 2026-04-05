import prisma from "@/lib/prisma";
import { webSearch, TavilySnippet } from "@/app/utils/web-search";
import {
  ChatHistory,
  generateContextualLLMResponseStream,
  generatePureLLMResponseStream,
} from "@/service/llmService";
import { QueryDBDebug, queryDBDetailed } from "@/service/queryService";
import { getEnvInt } from "@/lib/env";

type AnswerQuestionInput = {
  query: string;
  documentId: string;
  userId: string;
  history?: ChatHistory;
  onChunk: (chunk: string) => void;
  useWebSearch?: boolean;
  debug?: boolean;
};

export type AnswerQuestionDebug = {
  retrieval: QueryDBDebug;
  usedContextualAnswering: boolean;
  usedWebSearch: boolean;
  webSearchFailed: boolean;
};

const NO_MATCHING_RESULTS = "No matching results found to construct context.";
const NO_DOCUMENT_TEXT_FALLBACK =
  "No document text available to answer this question from the document.";
const NO_RELEVANT_CONTEXT_FALLBACK =
  "I couldn't find relevant information for this question in the document.";
const RAG_MAX_CONTEXT_CHARS = getEnvInt("RAG_MAX_CONTEXT_CHARS", 14000, 1000);
const RAG_MAX_FALLBACK_TEXT_CHARS = getEnvInt(
  "RAG_MAX_FALLBACK_TEXT_CHARS",
  14000,
  1000,
);

function clampText(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, maxChars)}\n\n[Context truncated for length safety.]`;
}

async function persistChatHistory(
  documentId: string,
  userId: string,
  chatHistory: ChatHistory,
  query: string,
  response?: string,
) {
  const updatedHistory = [
    ...chatHistory,
    { role: "user", content: query },
    ...(response ? [{ role: "assistant" as const, content: response }] : []),
  ] as ChatHistory;

  const updateResult = await prisma.document.updateMany({
    where: { slug: documentId, userId },
    data: { chatHistory: updatedHistory },
  });

  if (updateResult.count === 0) {
    throw new Error(`Document with ID ${documentId} not found.`);
  }

  return updatedHistory;
}

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
  userId,
  history = [],
  onChunk,
  useWebSearch = false,
  debug = false,
}: AnswerQuestionInput): Promise<{
  response: string;
  chatHistory: ChatHistory;
  debug?: AnswerQuestionDebug;
}> {
  const document = await prisma.document.findFirst({
    where: { slug: documentId, userId },
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
  let webSearchContext = "";
  let webSearchFailureNote = "";

  const collectChunk = (chunk: string) => {
    response += chunk;
    onChunk(chunk);
  };

  if (useWebSearch) {
    try {
      const webResult = await webSearch(query);
      webSearchContext = buildWebSearchContext(
        webResult.snippets ?? [],
        webResult.answer,
      );
    } catch (error) {
      console.error("Web search failed:", error);
      webSearchFailureNote =
        "Web search is currently unavailable. I will answer using the document context only.";
    }
  }

  let retrievedContext = "";
  let hasRetrievedContext = false;
  let retrievalDebug: QueryDBDebug = {
    initialMatchCount: 0,
    finalMatchCount: 0,
    dedupedMatchCount: 0,
    rerankUsed: false,
    chunks: [],
  };

  if (document.embeddingsGenerated) {
    const retrieval = await queryDBDetailed(query, documentId);
    retrievedContext = retrieval.context;
    retrievalDebug = retrieval.debug;
    hasRetrievedContext =
      retrievedContext.trim().length > 0 &&
      retrievedContext !== NO_MATCHING_RESULTS;
  }

  const contextParts: string[] = [];

  if (hasRetrievedContext) {
    contextParts.push(`DOCUMENT EXTRACTS:\n${retrievedContext}`);
  }

  if (webSearchContext) {
    contextParts.push(webSearchContext);
  }

  const context = clampText(contextParts.join("\n\n"), RAG_MAX_CONTEXT_CHARS);

  try {
    if (context) {
      await generateContextualLLMResponseStream(
        query,
        context,
        chatHistory,
        collectChunk,
      );
    } else {
      const fallbackText = document.embeddingsGenerated
        ? NO_RELEVANT_CONTEXT_FALLBACK
        : document.extractedText || NO_DOCUMENT_TEXT_FALLBACK;

      const fallbackTextWithWebSearchNotice = webSearchFailureNote
        ? `${fallbackText}\n\n${webSearchFailureNote}`
        : fallbackText;

      await generatePureLLMResponseStream(
        query,
        clampText(fallbackTextWithWebSearchNotice, RAG_MAX_FALLBACK_TEXT_CHARS),
        chatHistory,
        collectChunk,
      );
    }
  } catch (error) {
    await persistChatHistory(documentId, userId, chatHistory, query, response);
    throw error;
  }

  const updatedHistory = await persistChatHistory(
    documentId,
    userId,
    chatHistory,
    query,
    response,
  );

  const usedContextualAnswering = Boolean(context);

  return {
    response,
    chatHistory: updatedHistory,
    ...(debug
      ? {
          debug: {
            retrieval: retrievalDebug,
            usedContextualAnswering,
            usedWebSearch: useWebSearch && Boolean(webSearchContext),
            webSearchFailed: useWebSearch && Boolean(webSearchFailureNote),
          },
        }
      : {}),
  };
}
