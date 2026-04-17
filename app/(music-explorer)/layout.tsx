import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sidebar";
import MobileNav from "@/components/MobileNav";
import ConditionalLyricsView from "@/components/player/ConditionalLyricsView";

export default function ExplorerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SidebarProvider className="h-dvh">
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        <MobileNav />
        <div className="flex h-[calc(100dvh-3rem)]">
          <div className="flex-1 overflow-auto px-4 pb-24 md:px-0">{children}</div>
          <ConditionalLyricsView />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
