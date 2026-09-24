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
  const current = usePathname() === href;
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
