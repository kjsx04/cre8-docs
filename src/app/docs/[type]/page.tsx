"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

// This page is no longer needed — redirect to the single-screen editor
export default function InputRedirect() {
  const router = useRouter();
  const params = useParams();
  const slug = params.type as string;

  useEffect(() => {
    router.replace(`/docs/${slug}/complete`);
  }, [router, slug]);

  return null;
}
