import { EmptyState } from "@/components/empty-state";
import { PageContainer, PageHeader } from "@/components/page";

// The talks list replaces the empty state in Story 2.3; the "New talk" button
// arrives with /talks/new in Story 2.2.
export default function TalksPage() {
  return (
    <PageContainer className="space-y-6">
      <PageHeader title="Talks" />
      <EmptyState
        title="No talks yet"
        description="Add the first talk of your programme."
      />
    </PageContainer>
  );
}
