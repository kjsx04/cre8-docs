import { NextRequest, NextResponse } from "next/server";
import { API_BASE } from "@/lib/admin-constants";

/**
 * POST /api/listings/create
 *
 * Creates a new listing as a draft via the Cloudflare Worker → Webflow POST.
 * Body: { fieldData: { ...fields } }
 * Returns the created item with its new Webflow ID.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Wrap in Webflow's expected format — always create as draft
    const payload = {
      isArchived: false,
      isDraft: true,
      fieldData: body.fieldData,
    };

    const res = await fetch(`${API_BASE}/listings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Worker POST failed:", res.status, text);
      return NextResponse.json(
        { error: `Worker returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("Failed to create listing:", err);
    return NextResponse.json(
      { error: "Failed to create listing" },
      { status: 500 }
    );
  }
}
