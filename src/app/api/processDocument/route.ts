import { NextResponse } from "next/server";
import { getFileFromS3 } from "@/service/s3Service";
import { processDocument } from "@/service/processDocument";
import prisma from "@/lib/prisma";
import { checkUploadLimit } from "@/service/rateLimitService";
import { requireAuth } from "@/lib/requireAuth";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if ("response" in auth) return auth.response;

    const isAllowed = await checkUploadLimit(auth.userId);
    if (!isAllowed) {
      return NextResponse.json(
        {
          message:
            "Rate limit exceeded. Maximum 5 document operations per 24 hours.",
        },
        { status: 429 },
      );
    }

    const { id } = await req.json();

    if (!id) {
      return NextResponse.json(
        { message: "Document ID is required." },
        { status: 400 },
      );
    }

    const document = await prisma.document.findFirst({
      where: { slug: id, userId: auth.userId },
      select: { objectKey: true, embeddingsGenerated: true },
    });

    if (!document) {
      return NextResponse.json(
        { message: "Document not found." },
        { status: 404 },
      );
    }

    if (document.embeddingsGenerated) {
      console.log("Document already processed. Skipping.");
      return NextResponse.json(
        { message: "Document already processed." },
        { status: 200 },
      );
    }

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
    console.error("Error in API route:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { message: "Internal server error.", error: errorMessage },
      { status: 500 },
    );
  }
}
