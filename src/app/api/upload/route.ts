import { createSignedURL } from "@/service/s3Service";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/prisma";
import { checkUploadLimit } from "@/service/rateLimitService";
import { requireAuth } from "@/lib/requireAuth";
import { apiError } from "@/lib/api-response";
import { getRequestId } from "@/lib/request-id";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const auth = await requireAuth();
    if ("response" in auth) return auth.response;

    const isAllowed = await checkUploadLimit(auth.userId);
    if (!isAllowed) {
      return apiError(
        "Rate limit exceeded. Maximum 5 uploads per 24 hours.",
        "RATE_LIMIT_EXCEEDED",
        429,
      );
    }

    const { fileName, fileType, slug } = await req.json();

    if (!fileName || !fileType || !slug) {
      return apiError(
        "Missing required fields.",
        "MISSING_REQUIRED_FIELDS",
        400,
      );
    }

    const objectKey = `${uuidv4()}-${fileName}`;

    await prisma.document.create({
      data: {
        objectKey,
        slug: slug,
        fileName: fileName,
        userId: auth.userId,
        processingStatus: "QUEUED",
      },
    });

    const signedUrl = await createSignedURL(objectKey);

    return NextResponse.json({ signedUrl }, { status: 200 });
  } catch (error) {
    console.error(`[request:${requestId}] Upload Error:`, error);
    return apiError("Server error during upload.", "UPLOAD_FAILED", 500, {
      details: { requestId },
    });
  }
}
