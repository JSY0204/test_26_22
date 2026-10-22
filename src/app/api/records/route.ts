import { NextRequest, NextResponse } from "next/server";

const GOOGLE_SCRIPT_URL =
  process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbyj5CxqvmKzKq5K35iT3zZ3xsvCGpWZBEEe_i37xjeL1ajlu2GOYwAfJTJbb5u9CCNJXg/exec";

export async function GET(req: NextRequest) {
  if (!GOOGLE_SCRIPT_URL) {
    return NextResponse.json({ success: false, error: "NEXT_PUBLIC_GOOGLE_SCRIPT_URL not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const targetUrl = new URL(GOOGLE_SCRIPT_URL);
  searchParams.forEach((value, key) => {
    targetUrl.searchParams.append(key, value);
  });

  try {
    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      cache: "no-store",
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!GOOGLE_SCRIPT_URL) {
    return NextResponse.json({ success: false, error: "NEXT_PUBLIC_GOOGLE_SCRIPT_URL not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(body),
      redirect: "follow",
    });

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return NextResponse.json(data);
    } catch {
      return NextResponse.json({ success: true, raw: text });
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
