import { getFileFromS3 } from "@/service/s3Service";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/requireAuth";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if ("response" in auth) return auth.response;

    const { id } = await req.json();
    if (!id) {
      return new Response(JSON.stringify({ error: "ID is required" }), {
        status: 400,
      });
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
        return new Response(JSON.stringify({ error: "Document not found" }), {
          status: 404,
        });
      }

      1;
      const pdfBuffer = await getFileFromS3(document.objectKey);

      const base64Pdf = pdfBuffer.toString("base64");
      return new Response(JSON.stringify({ pdf: base64Pdf }));
    } catch (error: any) {
      console.error(
        "Error fetching PDF from S3:",
        JSON.stringify(error, null, 2),
      );
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to fetch PDF from S3",
          code: error.code,
        }),
        { status: 500 },
      );
    }
  } catch (error: any) {
    console.error("Error processing request:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to process request",
      }),
      { status: 400 },
    );
  }
}
