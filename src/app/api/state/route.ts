import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getFullSnapshot } from "@/lib/bracket/dto";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getFullSnapshot(prisma);
  return NextResponse.json(snapshot);
}
