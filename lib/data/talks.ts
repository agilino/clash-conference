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

/**
 * Whether another talk starts at this exact instant in the same room. A talk has
 * no duration, so the same start is the only clash. Rooms compare without outer
 * spaces and case ("main hall" is "Main hall"); SQLite has no case-insensitive
 * mode in Prisma, so the few talks at that start are compared here. A talk
 * without a room never clashes. `exceptId` leaves out the talk being edited.
 */
export async function isRoomBooked(
  startsAt: Date,
  room: string | null,
  exceptId?: string,
): Promise<boolean> {
  if (!room) return false;
  const wanted = room.trim().toLowerCase();
  const sameStart = await prisma.talk.findMany({
    where: { startsAt, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { room: true },
  });
  return sameStart.some((talk) => talk.room?.trim().toLowerCase() === wanted);
}
