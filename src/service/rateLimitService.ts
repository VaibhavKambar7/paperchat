import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
export const redisClient = new Redis(redisUrl);

// sliding window logic tracking queries.
// limits to requests per one hour window.
export async function checkQueryLimit(userId: string): Promise<boolean> {
  const limit = 30;
  const windowMs = 3600 * 1000;
  const now = Date.now();
  const key = `rate_limit:query:${userId}`;

  // use a transaction pipeline to run atomical counts
  const pipeline = redisClient.pipeline();

  // remove requests older than the sliding window
  pipeline.zremrangebyscore(key, 0, now - windowMs);

  // add a new timestamp marker into the window
  pipeline.zadd(key, now, `${now}-${Math.random()}`);

  // count how many markers exist in the window
  pipeline.zcard(key);

  // set expiry so redis clears inactive memory
  pipeline.expire(key, 3600);

  const results = await pipeline.exec();
  if (!results) return false;

  const requestCount = results[2][1] as number;
  return requestCount <= limit;
}

// sliding window logic tracking pdf uploads.
// limits to uploads per one day window.
export async function checkUploadLimit(userId: string): Promise<boolean> {
  const limit = 5;
  const windowMs = 24 * 3600 * 1000;
  const now = Date.now();
  const key = `rate_limit:upload:${userId}`;

  const pipeline = redisClient.pipeline();

  pipeline.zremrangebyscore(key, 0, now - windowMs);

  pipeline.zadd(key, now, `${now}-${Math.random()}`);

  pipeline.zcard(key);

  pipeline.expire(key, 24 * 3600);

  const results = await pipeline.exec();
  if (!results) return false;

  const requestCount = results[2][1] as number;
  return requestCount <= limit;
}
