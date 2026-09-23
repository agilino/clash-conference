import Link from "next/link";

// The event name and the "Settings" link arrive with the Settings record in Story 2.1.
export function AppHeader() {
  return (
    <header className="h-14 w-full shrink-0 border-b">
      <div className="mx-auto flex h-full w-full max-w-4xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" className="font-medium">
          clash-conference
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/">Talks</Link>
        </nav>
      </div>
    </header>
  );
}
