import { NextResponse } from "next/server";
import { ChatHistory } from "@/service/llmService";
import { answerQuestion } from "@/service/answerQuestion";
import prisma from "@/lib/prisma";
import { checkQueryLimit } from "@/service/rateLimitService";
import { requireAuth } from "@/lib/requireAuth";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if ("response" in auth) return auth.response;

    const isAllowed = await checkQueryLimit(auth.userId);
    if (!isAllowed) {
      return NextResponse.json(
        { message: "Rate limit exceeded. Maximum 30 queries per 1 hour." },
        { status: 429 },
      );
    }

    const { query, documentId, useWebSearch } = await req.json();

    if (!query || !documentId) {
      return NextResponse.json(
        { message: "Query and Document ID are required." },
        { status: 400 },
      );
    }

    const document = await prisma.document.findFirst({
      where: { slug: documentId, userId: auth.userId },
      select: { chatHistory: true },
    });

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
          await answerQuestion({
            query,
            userId: auth.userId,
            history: existingChatHistory,
            documentId,
            onChunk: onChunkCallback,
            useWebSearch,
          });
        } catch (agentError) {
          console.error(
            "Unhandled error during query execution in stream:",
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
    console.error("Error in API route:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { message: "Internal server error.", error: errorMessage },
      { status: 500 },
    );
  }
}
