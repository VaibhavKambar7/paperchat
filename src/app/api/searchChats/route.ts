import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/requireAuth";
import { apiError } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("response" in auth) return auth.response;
    const { keyword } = await req.json();

    const documents = await prisma.document.findMany({
      where: {
        userId: auth.userId,
        ...(keyword
          ? {
              fileName: {
                contains: keyword,
                mode: "insensitive" as const,
              },
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("Error fetching chats:", error);
    return apiError("Failed to fetch chats", "SEARCH_CHATS_FAILED", 500);
  }
}
