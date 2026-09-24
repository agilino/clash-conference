-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventName" TEXT NOT NULL,
    "venueName" TEXT NOT NULL,
    "hostEmail" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Talk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "room" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "clashId" TEXT,
    "lastMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
