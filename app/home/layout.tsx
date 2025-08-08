import "@/app/globals.css";
import PlayerBar from "@/components/player/PlayerBar";
import LyricsView from "@/components/player/LyricsView";
import { Sidebar } from "@/components/sidebar";

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r">
        <Sidebar className="h-full" />
      </aside>
      <main className="flex-1 overflow-hidden">
        <div className="flex h-full">
          <div className="flex-1 overflow-auto">{children}</div>
          <LyricsView />
        </div>
      </main>
    </div>
  );
}
