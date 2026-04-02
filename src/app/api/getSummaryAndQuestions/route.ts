import prisma from "@/lib/prisma";
import {
  generateSummaryOnly,
  generateQuestionsOnly,
} from "@/service/llmService";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";
import { apiError } from "@/lib/api-response";
import { getRequestId } from "@/lib/request-id";

export const POST = async (req: Request) => {
  const requestId = getRequestId(req);
  try {
    const auth = await requireAuth();
    if ("response" in auth) return auth.response;

    const { id } = await req.json();

    if (!id) {
      return apiError("Document ID is required", "MISSING_DOCUMENT_ID", 400);
    }

    const document = await prisma.document.findFirst({
      where: { slug: id, userId: auth.userId },
      select: { extractedText: true },
    });

    if (!document || !document.extractedText) {
      return apiError(
        "Document or text not found",
        "DOCUMENT_TEXT_NOT_FOUND",
        404,
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullSummary = "";

        try {
          const onSummaryChunk = (chunk: string) => {
            console.log("Sending chunk:", chunk);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ summaryChunk: chunk })}\n\n`,
              ),
            );
            fullSummary += chunk;
          };

          console.log("Starting summary generation...");
          await generateSummaryOnly(
            document.extractedText ?? "",
            onSummaryChunk,
          );
          console.log(
            "Summary generation complete. Full summary length:",
            fullSummary.length,
          );

          console.log("Starting questions generation...");
          const questions = await generateQuestionsOnly(
            document.extractedText ?? "",
          );
          console.log("Questions generated:", questions);

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ questions })}\n\n`),
          );

          const updateResult = await prisma.document.updateMany({
            where: { slug: id, userId: auth.userId },
            data: {
              chatHistory: [
                {
                  role: "assistant",
                  content: fullSummary,
                },
              ],
            },
          });

          if (updateResult.count === 0) {
            throw new Error("Document not found for current user.");
          }

          console.log("Sending [DONE] signal");
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Stream error occurred" })}\n\n`,
            ),
          );
          console.error("Streaming error:", error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error(
      `[request:${requestId}] Error in /api/getSummaryAndQuestions:`,
      error,
    );
    return apiError(
      "Internal server error",
      "GET_SUMMARY_AND_QUESTIONS_FAILED",
      500,
      { details: { requestId } },
    );
  }
};
