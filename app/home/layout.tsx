import "@/app/globals.css";
import PlayerBar from "@/components/player/PlayerBar";
import LyricsView from "@/components/player/LyricsView";

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-screen">
      {children}
      <LyricsView />
      
    </div>
  );
}
