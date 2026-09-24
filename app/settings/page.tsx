import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/page";
import { SettingsForm } from "@/components/settings/settings-form";
import { getSettings } from "@/lib/data/settings";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  // Empty strings, not the seed values: the form opens blank while no record
  // exists and the first save creates the single row.
  const settings = await getSettings();

  return (
    <PageContainer className="space-y-6">
      <PageHeader title="Settings" />
      <SettingsForm
        defaultValues={{
          eventName: settings?.eventName ?? "",
          venueName: settings?.venueName ?? "",
          hostEmail: settings?.hostEmail ?? "",
        }}
      />
    </PageContainer>
  );
}
