import { createSignedURL } from "@/service/s3Service";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkUploadLimit } from "@/service/rateLimitService";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in to upload." },
        { status: 401 },
      );
    }

    const isAllowed = await checkUploadLimit((session.user as any).id);
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
        userId: (session.user as any).id,
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
