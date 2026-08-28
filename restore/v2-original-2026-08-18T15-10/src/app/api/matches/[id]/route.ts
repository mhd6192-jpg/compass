import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMatchDTO } from "@/lib/bracket/dto";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const dto = await getMatchDTO(prisma, params.id);
    return NextResponse.json(dto);
  } catch {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
}
