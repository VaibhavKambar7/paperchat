import { NextResponse } from "next/server";

type ApiErrorOptions = {
  details?: unknown;
};

export function apiError(
  message: string,
  code: string,
  status: number,
  options?: ApiErrorOptions,
) {
  return NextResponse.json(
    {
      message,
      code,
      ...(options?.details !== undefined ? { details: options.details } : {}),
    },
    { status },
  );
}
