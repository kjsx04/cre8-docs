"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

// Review page is no longer needed — redirect to the single-screen editor
export default function ReviewRedirect() {
  const router = useRouter();
  const params = useParams();
  const slug = params.type as string;

  useEffect(() => {
    router.replace(`/docs/${slug}/complete`);
  }, [router, slug]);

  return null;
}
