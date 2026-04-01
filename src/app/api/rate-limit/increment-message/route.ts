import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if ("response" in auth) return auth.response;

    const usage = await prisma.usage.findUnique({
      where: { userId: auth.userId },
    });

    if (!usage) {
      await prisma.usage.create({
        data: {
          userId: auth.userId,
          ip: `session:${auth.userId}`,
        },
      });
    }

    await prisma.usage.update({
      where: { userId: auth.userId },
      data: {
        messageCount: { increment: 1 },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
