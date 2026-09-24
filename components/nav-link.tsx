"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The only client code in the header. The header itself stays a Server Component
 * so it can read the Settings record on every render, so the current-route
 * marking lives here, where usePathname() is available.
 */
export function NavLink({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  const pathname = usePathname();
  // "Talks" (href "/") is the section the talk screens belong to, so it is also
  // current on /talks/new and /talks/[id]/edit. Every other link matches exactly.
  const current =
    pathname === href || (href === "/" && pathname.startsWith("/talks/"));
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={current ? "text-foreground" : "text-muted-foreground"}
    >
      {children}
    </Link>
  );
}
