import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
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

    const document = await prisma.document.findFirst({
      where: { slug: id, userId: auth.userId },
      select: {
        chatHistory: true,
        embeddingsGenerated: true,
      },
    });

    if (!document) {
      return apiError("Document not found", "DOCUMENT_NOT_FOUND", 404);
    }

    return NextResponse.json({
      response: document,
      status: 200,
    });
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return apiError("Internal server error", "GET_CONVERSATION_FAILED", 500);
  }
}
