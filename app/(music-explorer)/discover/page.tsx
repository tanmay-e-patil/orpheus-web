import type React from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import DiscoverLanding from "./_components/DiscoverLanding";

export default async function DiscoverPage() {
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
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold mb-4">
            Discover Music with Multi-Stage Workflow
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Find music through YouTube, enrich with Spotify metadata, add
            lyrics, and build your perfect library.
          </p>
        </div>
        <DiscoverLanding />
      </div>
    </main>
  );
}
