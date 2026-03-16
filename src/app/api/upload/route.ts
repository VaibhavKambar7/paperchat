import { createSignedURL } from "@/service/s3Service";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in to upload." },
        { status: 401 },
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
