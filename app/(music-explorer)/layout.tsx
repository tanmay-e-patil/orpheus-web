import { Sidebar } from "@/components/sidebar";
import LyricsView from "@/components/player/LyricsView";
import MobileNav from "@/components/MobileNav";

export default function ExplorerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-dvh">
      <aside className="hidden md:block w-64 border-r md:sticky md:top-0">
        <Sidebar className="h-dvh" />
      </aside>
      <main className="flex-1 overflow-hidden">
        <MobileNav />
        <div className="flex h-[calc(100dvh-3rem)] md:h-full">
          <div className="flex-1 overflow-auto px-4 pb-24 md:px-0">{children}</div>
          <div className="hidden md:block">
            <LyricsView />
          </div>
        </div>
      </main>
    </div>
  );
}
