import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { apiError } from "@/lib/api-response";

type AuthenticatedContext = {
  userId: string;
};

type UnauthenticatedContext = {
  response: NextResponse;
};

export async function requireAuth(): Promise<
  AuthenticatedContext | UnauthenticatedContext
> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!session?.user || !userId) {
    return {
      response: apiError("Unauthorized", "AUTH_UNAUTHORIZED", 401),
    };
  }

  return { userId };
}
