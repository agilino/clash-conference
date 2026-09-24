import "server-only";

import { prisma } from "@/lib/prisma";
import type { Talk } from "@/lib/generated/prisma/client";

/** Every talk, earliest start first: the order of the talks list. */
export function getTalks(): Promise<Talk[]> {
  return prisma.talk.findMany({ orderBy: { startsAt: "asc" } });
}

/** One talk by id, or null when no row has that id (the edit page then 404s). */
export function getTalkById(id: string): Promise<Talk | null> {
  return prisma.talk.findUnique({ where: { id } });
}
