"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Compass, LogOut, Music } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { toastError, toastInfo } from "@/lib/toast";

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { state } = useSidebar();

  async function handleSignOut() {
    try {
      await authClient.signOut();
      toastInfo("Signed out");
      router.push("/");
      router.refresh();
    } catch (e) {
      toastError("Failed to sign out");
      console.error(e);
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Orpheus" className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto">
              <Link href="/home">
                <span className="font-bold">
                  {state === "collapsed" ? "O" : "Orpheus"}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname === "/home"}
              tooltip="Tracks"
              className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto"
            >
              <Link href="/home">
                <Music />
                <span>Tracks</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/discover")}
              tooltip="Discover"
              className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto"
            >
              <Link href="/discover">
                <Compass />
                <span>Discover</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="pb-20">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              tooltip="Sign out"
              className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
