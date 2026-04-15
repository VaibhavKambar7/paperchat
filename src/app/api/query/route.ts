import { NextResponse } from "next/server";
import { ChatHistory } from "@/service/llmService";
import { answerQuestion } from "@/service/answerQuestion";
import prisma from "@/lib/prisma";
import { checkQueryLimit } from "@/service/rateLimitService";
import { requireAuth } from "@/lib/requireAuth";
import { apiError } from "@/lib/api-response";
import { getRequestId } from "@/lib/request-id";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const auth = await requireAuth();
    if ("response" in auth) return auth.response;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body.", "INVALID_JSON_BODY", 400);
    }

    const { query, documentId, useWebSearch, debug } = (body || {}) as {
      query?: string;
      documentId?: string;
      useWebSearch?: boolean;
      debug?: boolean;
    };

    if (!query || !documentId) {
      return apiError(
        "Query and Document ID are required.",
        "MISSING_QUERY_OR_DOCUMENT_ID",
        400,
      );
    }

    const isAllowed = await checkQueryLimit(auth.userId);
    if (!isAllowed) {
      return apiError(
        "Rate limit exceeded. Maximum 30 queries per 1 hour.",
        "RATE_LIMIT_EXCEEDED",
        429,
      );
    }

    const document = await prisma.document.findFirst({
      where: { slug: documentId, userId: auth.userId },
      select: { slug: true, chatHistory: true },
    });

    if (!document) {
      return apiError("Document not found.", "DOCUMENT_NOT_FOUND", 404);
    }

    const existingChatHistory: ChatHistory = (document?.chatHistory ||
      []) as ChatHistory;

    const clientFacingStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const onChunkCallback = (chunk: string) => {
          const sseFormattedChunk = `data: ${JSON.stringify({ chunk: chunk })}\n\n`;
          controller.enqueue(encoder.encode(sseFormattedChunk));
        };

        try {
          const result = await answerQuestion({
            query,
            userId: auth.userId,
            history: existingChatHistory,
            documentId,
            onChunk: onChunkCallback,
            useWebSearch: Boolean(useWebSearch),
            debug: Boolean(debug),
          });

          if (debug && result.debug) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ debug: result.debug })}\n\n`,
              ),
            );
          }
        } catch (agentError) {
          console.error(
            `[request:${requestId}] Unhandled error during query execution in stream:`,
            agentError,
          );
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: agentError instanceof Error ? agentError.message : String(agentError) })}\n\n`,
            ),
          );
        } finally {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new NextResponse(clientFacingStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error(`[request:${requestId}] Error in API route:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return apiError("Internal server error.", "QUERY_FAILED", 500, {
      details: { requestId, errorMessage },
    });
  }
}
