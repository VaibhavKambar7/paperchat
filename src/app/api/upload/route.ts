import { createSignedURL } from "@/service/s3Service";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
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
        { message: "Rate limit exceeded. Maximum 5 uploads per 24 hours." },
        { status: 429 },
      );
    }

    const { fileName, fileType, slug } = await req.json();

    if (!fileName || !fileType || !slug) {
      return NextResponse.json(
        { message: "Missing required fields." },
        { status: 400 },
      );
    }

    const objectKey = `${uuidv4()}-${fileName}`;

    await prisma.document.create({
      data: {
        objectKey,
        slug: slug,
        fileName: fileName,
        userId: auth.userId,
      },
    });

    const signedUrl = await createSignedURL(objectKey);

    return NextResponse.json({ signedUrl }, { status: 200 });
  } catch (error) {
    console.error("Upload Error: ", error);
    return NextResponse.json(
      { message: "Server error during upload." },
      { status: 500 },
    );
  }
}
