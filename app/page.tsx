import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageContainer, PageHeader } from "@/components/page";
import { TalkList } from "@/components/talks/talk-list";
import { Button } from "@/components/ui/button";
import { getTalks } from "@/lib/data/talks";

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
        <TalkList talks={talks} />
      )}
    </PageContainer>
  );
}
