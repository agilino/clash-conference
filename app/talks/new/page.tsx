import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/page";
import { TalkForm } from "@/components/talks/talk-form";

export const metadata: Metadata = {
  title: "New talk",
};

export default function NewTalkPage() {
  return (
    <PageContainer className="space-y-6">
      <PageHeader title="New talk" />
      <TalkForm mode="create" />
    </PageContainer>
  );
}
