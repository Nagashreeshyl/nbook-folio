import Link from "next/link";

export function Wordmark({ size = "lg" }: { size?: "sm" | "lg" }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-baseline gap-1 group ${
        size === "lg" ? "text-[42px]" : "text-[19px]"
      } font-serif font-semibold tracking-tight text-ink`}
    >
      N<span className="text-amber">BOOK</span>
      <span
        className={`ms-1 rounded-full bg-amber/70 ${
          size === "lg" ? "h-1.5 w-1.5" : "h-1 w-1"
        } group-hover:scale-125 transition-transform`}
      />
    </Link>
  );
}
