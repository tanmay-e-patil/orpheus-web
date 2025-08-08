import { Sidebar } from "@/components/sidebar";
import LyricsView from "@/components/player/LyricsView";

export default function ExplorerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r">
        <Sidebar className="h-full" />
      </aside>
      <main className="flex-1 overflow-auto">
        {children}
        <LyricsView />
      </main>
    </div>
  );
}
