export function getRequestId(req: Request): string {
  const incomingRequestId = req.headers.get("x-request-id")?.trim();
  if (incomingRequestId) {
    return incomingRequestId;
  }
  return crypto.randomUUID();
}
