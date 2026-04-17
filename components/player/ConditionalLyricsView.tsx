"use client";
import { usePathname } from "next/navigation";
import LyricsView from "./LyricsView";

export default function ConditionalLyricsView() {
  const pathname = usePathname();
  if (pathname.startsWith("/discover")) return null;
  return (
    <div className="hidden md:block">
      <LyricsView />
    </div>
  );
}
