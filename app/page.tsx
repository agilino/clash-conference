import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageContainer, PageHeader } from "@/components/page";
import { DeleteTalkButton } from "@/components/talks/delete-talk-button";
import { Button } from "@/components/ui/button";
import { getTalks } from "@/lib/data/talks";

// Interim rows — title, Edit, Delete — so a talk can be created, changed and
// removed before the real list exists. Story 2.3 replaces the <ul> with the
// full row (meta line, outcome line, status badge, Publish).
export default async function TalksPage() {
  const talks = await getTalks();

  const newTalk = (
    <Button asChild>
      <Link href="/talks/new">New talk</Link>
    </Button>
  );

  return (
    <PageContainer className="space-y-6">
      <PageHeader title="Talks">{newTalk}</PageHeader>
      {talks.length === 0 ? (
        <EmptyState
          title="No talks yet"
          description="Add the first talk of your programme."
        >
          {newTalk}
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border">
          {talks.map((talk) => (
            <li
              key={talk.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <span className="min-w-0 truncate font-medium">{talk.title}</span>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/talks/${talk.id}/edit`}>Edit</Link>
                </Button>
                <DeleteTalkButton talkId={talk.id} title={talk.title} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
