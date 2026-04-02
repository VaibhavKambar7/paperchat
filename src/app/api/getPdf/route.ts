import { getFileFromS3 } from "@/service/s3Service";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";
import { apiError } from "@/lib/api-response";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if ("response" in auth) return auth.response;

    const { id } = await req.json();
    if (!id) {
      return apiError("ID is required", "MISSING_DOCUMENT_ID", 400);
    }

    try {
      const document = await prisma.document.findFirst({
        where: { slug: id, userId: auth.userId },
        select: {
          objectKey: true,
          fileName: true,
        },
      });

      if (!document) {
        return apiError("Document not found", "DOCUMENT_NOT_FOUND", 404);
      }

      const pdfBuffer = await getFileFromS3(document.objectKey);

      const base64Pdf = pdfBuffer.toString("base64");
      return NextResponse.json({ pdf: base64Pdf });
    } catch (error: any) {
      console.error(
        "Error fetching PDF from S3:",
        JSON.stringify(error, null, 2),
      );
      return apiError(
        error.message || "Failed to fetch PDF from S3",
        "GET_PDF_FROM_STORAGE_FAILED",
        500,
        { details: { storageCode: error.code } },
      );
    }
  } catch (error: any) {
    console.error("Error processing request:", error);
    return apiError(
      error.message || "Failed to process request",
      "GET_PDF_REQUEST_FAILED",
      400,
    );
  }
}
