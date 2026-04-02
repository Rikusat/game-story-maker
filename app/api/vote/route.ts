import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { tallyAndAdvance } from "@/lib/game/tally";

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  const { sceneChoiceId, choice, roomId, userId } = await request.json();

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const { error } = await supabase.from("votes").upsert(
    { scene_choice_id: sceneChoiceId, room_id: roomId, user_id: userId, choice },
    { onConflict: "scene_choice_id,user_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: votes } = await supabase
    .from("votes")
    .select("*")
    .eq("scene_choice_id", sceneChoiceId);

  const { data: players } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", roomId)
    .eq("is_active", true);

  const allVoted = (votes?.length ?? 0) >= (players?.length ?? 1);

  if (allVoted) {
    await tallyAndAdvance(supabase, sceneChoiceId, roomId);
  }

  return NextResponse.json({ ok: true, allVoted });
}

// タイマー切れ時の集計（ホストが呼ぶ）
export async function PUT(request: NextRequest) {
  const supabase = createAdminClient();
  const { sceneChoiceId, roomId } = await request.json();
  await tallyAndAdvance(supabase, sceneChoiceId, roomId);
  return NextResponse.json({ ok: true });
}
