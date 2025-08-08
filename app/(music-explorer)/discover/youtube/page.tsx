import type React from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import YouTubeDiscovery from "./_components/YouTubeDiscovery";

export default async function YouTubeDiscoveryPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }

  return (
    <main className="container mx-auto py-8 px-4">
      <Link href="/home">
        <h1 className="text-3xl font-bold mb-8 text-center">Orpheus</h1>
      </Link>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold mb-4">
            Stage 1: YouTube Discovery
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Find potential music videos based on your search query
          </p>
        </div>
        <YouTubeDiscovery />
      </div>
    </main>
  );
}
