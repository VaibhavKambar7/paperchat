import { NextResponse } from "next/server";
import { getFileFromS3 } from "@/service/s3Service";
import { processDocument } from "@/service/processDocument";
import prisma from "@/lib/prisma";
import { checkUploadLimit } from "@/service/rateLimitService";
import { requireAuth } from "@/lib/requireAuth";
import { apiError } from "@/lib/api-response";
import { getRequestId } from "@/lib/request-id";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  let documentId: string | null = null;
  let userId: string | null = null;
  try {
    const auth = await requireAuth();
    if ("response" in auth) return auth.response;
    userId = auth.userId;

    const isAllowed = await checkUploadLimit(auth.userId);
    if (!isAllowed) {
      return apiError(
        "Rate limit exceeded. Maximum 5 document operations per 24 hours.",
        "RATE_LIMIT_EXCEEDED",
        429,
      );
    }

    const { id } = await req.json();
    documentId = id;

    if (!id) {
      return apiError("Document ID is required.", "MISSING_DOCUMENT_ID", 400);
    }

    const document = await prisma.document.findFirst({
      where: { slug: id, userId: auth.userId },
      select: { objectKey: true, embeddingsGenerated: true },
    });

    if (!document) {
      return apiError("Document not found.", "DOCUMENT_NOT_FOUND", 404);
    }

    if (document.embeddingsGenerated) {
      await prisma.document.updateMany({
        where: { slug: id, userId: auth.userId },
        data: { processingStatus: "DONE" },
      });
      console.log("Document already processed. Skipping.");
      return NextResponse.json(
        { message: "Document already processed." },
        { status: 200 },
      );
    }

    await prisma.document.updateMany({
      where: { slug: id, userId: auth.userId },
      data: { processingStatus: "PROCESSING" },
    });

    const pdfBuffer = await getFileFromS3(document.objectKey);

    const result = await processDocument({
      documentId: id,
      userId: auth.userId,
      pdfBuffer,
    });

    return NextResponse.json(
      {
        message: result.message,
        result,
      },
      { status: 200 },
    );
  } catch (error) {
    if (documentId && userId) {
      await prisma.document.updateMany({
        where: { slug: documentId, userId },
        data: { processingStatus: "FAILED" },
      });
    }
    console.error(`[request:${requestId}] Error in API route:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return apiError("Internal server error.", "PROCESS_DOCUMENT_FAILED", 500, {
      details: { requestId, errorMessage },
    });
  }
}
