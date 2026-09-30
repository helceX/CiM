import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>&copy; {new Date().getFullYear()} CiM. All rights reserved.</p>
        <nav className="flex gap-5" aria-label="Footer">
          <Link href="/security" className="hover:text-foreground">
            Security
          </Link>
          <Link href="/resources" className="hover:text-foreground">
            Resources
          </Link>
          <Link href="/contact" className="hover:text-foreground">
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
