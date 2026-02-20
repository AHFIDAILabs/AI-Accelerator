import { LRUCache } from "lru-cache";

export const cache = new LRUCache<string, any>({
  max: 500,              // max number of cached items
  ttl: 1000 * 60 * 2,    // 2 minutes TTL
});
