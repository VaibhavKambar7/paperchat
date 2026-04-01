import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if ("response" in auth) return auth.response;

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { usage: true, subscription: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const usage = user.usage
      ? user.usage
      : await prisma.usage.create({
          data: {
            userId: user.id,
            email: user.email,
            ip: user.ip,
          },
        });

    const isProUser = user.subscription?.status === "ACTIVE";
    const plan = user.subscription?.plan ?? null;

    return NextResponse.json({
      pdfCount: usage.pdfCount,
      messageCount: usage.messageCount,
      isProUser,
      plan,
    });
  } catch (error) {
    console.error("Get Usage Error:", error);
    return NextResponse.json(
      { error: "Server error processing usage request" },
      { status: 500 },
    );
  }
}
