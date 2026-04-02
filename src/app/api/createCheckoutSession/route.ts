import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { requireAuth } from "@/lib/requireAuth";
import prisma from "@/lib/prisma";
import { apiError } from "@/lib/api-response";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("response" in auth) return auth.response;

  const { plan } = await req.json();
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true },
  });

  if (!user?.email) {
    return apiError(
      "Authenticated user does not have an email.",
      "AUTH_USER_EMAIL_MISSING",
      400,
    );
  }

  const stripeSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price:
          plan === "monthly"
            ? process.env.STRIPE_MONTHLY_PRICE_ID
            : process.env.STRIPE_YEARLY_PRICE_ID,
        quantity: 1,
      },
    ],
    customer_email: user.email,
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/billing`,
    metadata: { plan },
  });

  console.log(stripeSession);

  return NextResponse.json({ url: stripeSession.url });
}
