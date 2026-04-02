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

  // ルームの全プレイヤーを取得
  const { data: allPlayers } = await supabase
    .from("room_players")
    .select("user_id")
    .eq("room_id", roomId)
    .eq("is_active", true);

  const playerIds = (allPlayers ?? []).map((p: any) => p.user_id as string);

  // プロフィールを別途取得してボットを特定
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", playerIds);

  const botIds = (profiles ?? [])
    .filter((p: any) => (p.username as string).startsWith("🤖"))
    .map((p: any) => p.id as string);

  const humanIds = playerIds.filter((id) => !botIds.includes(id));

  // ボットを自動投票
  for (const botId of botIds) {
    const botChoice = Math.random() < 0.5 ? "A" : "B";
    await supabase.from("votes").upsert(
      { scene_choice_id: sceneChoiceId, room_id: roomId, user_id: botId, choice: botChoice },
      { onConflict: "scene_choice_id,user_id" }
    );
  }

  // 人間プレイヤー全員が投票済みか確認
  const { data: votes } = await supabase
    .from("votes").select("user_id").eq("scene_choice_id", sceneChoiceId);

  const votedUserIds = (votes ?? []).map((v: any) => v.user_id as string);
  const allVoted = humanIds.every((id) => votedUserIds.includes(id));

  if (allVoted) {
    await tallyAndAdvance(supabase, sceneChoiceId, roomId);
  }

  // 集計後のセッション状態を返す
  const { data: session } = await supabase
    .from("novel_sessions").select("current_scene, status, mbti_result")
    .eq("room_id", roomId).single();

  return NextResponse.json({
    ok: true,
    nextScene: session?.current_scene ?? 0,
    completed: session?.status === "completed",
    mbtiResult: session?.mbti_result ?? null,
  });
}

export async function PUT(request: NextRequest) {
  const supabase = createAdminClient();
  const { sceneChoiceId, roomId } = await request.json();
  await tallyAndAdvance(supabase, sceneChoiceId, roomId);
  return NextResponse.json({ ok: true });
}
