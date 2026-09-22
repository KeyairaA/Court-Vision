import { Link } from "react-router";

export function Wordmark({ size = "lg" }: { size?: "lg" | "sm" }) {
  return (
    <Link
      to="/"
      className={`flex items-center gap-2.5 font-display font-extrabold tracking-[0.04em] text-chrome-ink no-underline ${
        size === "lg" ? "text-[26px]" : "text-[23px]"
      }`}
    >
      <span aria-hidden="true" className={`inline-block shrink-0 bg-accent ${size === "lg" ? "size-3.5" : "size-3"}`} />
      COURT VISION
    </Link>
  );
}
