import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/page";
import { TalkForm } from "@/components/talks/talk-form";
import { asTalkStatus } from "@/lib/constants";
import { getTalkById } from "@/lib/data/talks";

export const metadata: Metadata = {
  title: "Edit talk",
};

export default async function EditTalkPage(
  props: PageProps<"/talks/[id]/edit">,
) {
  // params is a promise in Next 16.
  const { id } = await props.params;
  const talk = await getTalkById(id);
  if (!talk) notFound();

  return (
    <PageContainer className="space-y-6">
      <PageHeader title="Edit talk" />
      <TalkForm
        mode="edit"
        defaultValues={{
          id: talk.id,
          title: talk.title,
          description: talk.description,
          startsAt: talk.startsAt,
          room: talk.room,
          // Narrowed here, at the edge, so the form compares against TALK_STATUS
          // and a corrupted column value fails loudly instead of rendering.
          status: asTalkStatus(talk.status),
        }}
      />
    </PageContainer>
  );
}
