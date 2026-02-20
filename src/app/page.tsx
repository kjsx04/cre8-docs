"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Root page redirects to /docs
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/docs");
  }, [router]);
  return null;
}
