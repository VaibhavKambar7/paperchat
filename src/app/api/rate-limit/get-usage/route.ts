import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";
import { apiError } from "@/lib/api-response";
import { getRequestId } from "@/lib/request-id";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const auth = await requireAuth();
    if ("response" in auth) return auth.response;

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { usage: true, subscription: true },
    });

    if (!user) {
      return apiError("User not found", "USER_NOT_FOUND", 404, {
        details: { requestId },
      });
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
    console.error(`[request:${requestId}] Get Usage Error:`, error);
    return apiError(
      "Server error processing usage request",
      "GET_USAGE_FAILED",
      500,
      { details: { requestId } },
    );
  }
}
