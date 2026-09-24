import "server-only";

import { prisma } from "@/lib/prisma";
import type { Settings } from "@/lib/generated/prisma/client";

/**
 * The single Settings row, or null while none exists. findFirst rather than
 * findUnique: the row has a cuid id nobody knows, and there is only ever one
 * (app/actions/settings.ts is its only writer).
 */
export function getSettings(): Promise<Settings | null> {
  return prisma.settings.findFirst();
}
