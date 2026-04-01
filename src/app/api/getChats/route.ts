import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/requireAuth";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("response" in auth) return auth.response;
    const { page = 1, limit = 10 } = await req.json();

    const skip = (page - 1) * limit;

    const totalCount = await prisma.document.count({
      where: { userId: auth.userId },
    });

    const documents = await prisma.document.findMany({
      where: { userId: auth.userId },
      select: {
        slug: true,
        fileName: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: parseInt(limit.toString()),
    });

    return NextResponse.json({
      documents,
      pagination: {
        total: totalCount,
        page: parseInt(page.toString()),
        limit: parseInt(limit.toString()),
        hasMore: skip + parseInt(limit.toString()) < totalCount,
      },
    });
  } catch (error) {
    console.error("Error fetching chats:", error);
    return NextResponse.json(
      { error: "Failed to fetch chats" },
      { status: 500 },
    );
  }
}
