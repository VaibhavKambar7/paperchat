import { Redis } from "ioredis";
import { getEnvInt } from "@/lib/env";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
export const redisClient = new Redis(redisUrl);
const QUERY_LIMIT_PER_HOUR = getEnvInt("RAG_QUERY_LIMIT_PER_HOUR", 30, 1);
const UPLOAD_LIMIT_PER_DAY = getEnvInt("RAG_UPLOAD_LIMIT_PER_DAY", 5, 1);

async function checkSlidingWindowLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const now = Date.now();

  try {
    const pipeline = redisClient.pipeline();

    pipeline.zremrangebyscore(key, 0, now - windowMs);
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    pipeline.zcard(key);
    pipeline.expire(key, Math.ceil(windowMs / 1000));

    const results = await pipeline.exec();
    if (!results || !results[2] || results[2][0]) {
      console.error("Rate limit pipeline returned an unexpected result:", results);
      return true;
    }

    const requestCount = Number(results[2][1]);
    if (Number.isNaN(requestCount)) {
      console.error("Rate limit pipeline returned a non-numeric request count.");
      return true;
    }

    return requestCount <= limit;
  } catch (error) {
    // Fail open when Redis is unavailable so auth/query flows keep working locally.
    console.error("Rate limit check failed (allowing request):", error);
    return true;
  }
}

// sliding window logic tracking queries.
// limits to requests per one hour window.
export async function checkQueryLimit(userId: string): Promise<boolean> {
  return checkSlidingWindowLimit(
    `rate_limit:query:${userId}`,
    QUERY_LIMIT_PER_HOUR,
    3600 * 1000,
  );
}

// sliding window logic tracking pdf uploads.
// limits to uploads per one day window.
export async function checkUploadLimit(userId: string): Promise<boolean> {
  return checkSlidingWindowLimit(
    `rate_limit:upload:${userId}`,
    UPLOAD_LIMIT_PER_DAY,
    24 * 3600 * 1000,
  );
}
