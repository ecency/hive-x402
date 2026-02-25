import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Max requests per window. Default: 60 */
  max?: number;
  /** Window size in milliseconds. Default: 60000 (1 minute) */
  windowMs?: number;
}

/**
 * Simple in-memory rate limiter keyed by IP address.
 * No external dependencies required.
 */
export function rateLimit(options: RateLimitOptions = {}) {
  const max = options.max ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup of expired entries
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, windowMs);
  cleanup.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    res.set("X-RateLimit-Limit", String(max));
    res.set("X-RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    res.set("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    next();
  };
}
