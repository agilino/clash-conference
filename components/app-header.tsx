import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { getSettings } from "@/lib/data/settings";

// Async Server Component: the event name is read on every render, so a save in
// the settings form shows here without a reload. "clash-conference" stands in
// until the single Settings record exists.
export async function AppHeader() {
  const settings = await getSettings();

  return (
    <header className="h-14 w-full shrink-0 border-b">
      <div className="mx-auto flex h-full w-full max-w-4xl items-center justify-between gap-4 px-4 md:px-6">
        {/* min-w-0 + truncate: the event name has no length limit and the header
            a fixed height, so a long name ends in an ellipsis instead of wrapping
            past the border at phone width. */}
        <Link href="/" className="min-w-0 truncate font-medium">
          {settings?.eventName ?? "clash-conference"}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <NavLink href="/">Talks</NavLink>
          <NavLink href="/settings">Settings</NavLink>
        </nav>
      </div>
    </header>
  );
}
