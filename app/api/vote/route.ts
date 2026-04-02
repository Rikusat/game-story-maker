import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MBTI_SCENES, calculateMbti, type MbtiDimension, type VoteChoice } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sceneChoiceId, choice, roomId } = await request.json();

  // 投票を保存（重複は upsert で上書き）
  const { error } = await supabase.from("votes").upsert({
    scene_choice_id: sceneChoiceId,
    room_id: roomId,
    user_id: user.id,
    choice,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 全員投票済みか確認
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sceneChoiceId, roomId } = await request.json();
  await tallyAndAdvance(supabase, sceneChoiceId, roomId);

  return NextResponse.json({ ok: true });
}

async function tallyAndAdvance(supabase: any, sceneChoiceId: string, roomId: string) {
  const { data: sceneChoice } = await supabase
    .from("scene_choices")
    .select("*, novel_sessions(*)")
    .eq("id", sceneChoiceId)
    .single();

  if (!sceneChoice || sceneChoice.winning_choice) return; // 既に集計済み

  const { data: votes } = await supabase
    .from("votes")
    .select("*")
    .eq("scene_choice_id", sceneChoiceId);

  const countA = votes?.filter((v: any) => v.choice === "A").length ?? 0;
  const countB = votes?.filter((v: any) => v.choice === "B").length ?? 0;
  // 同数はランダム
  const winner: VoteChoice = countA >= countB ? "A" : "B";

  await supabase
    .from("scene_choices")
    .update({ winning_choice: winner })
    .eq("id", sceneChoiceId);

  const session = sceneChoice.novel_sessions;
  const nextScene = session.current_scene + 1;
  const isLastScene = nextScene >= 4;

  if (isLastScene) {
    // MBTI 計算
    const { data: allChoices } = await supabase
      .from("scene_choices")
      .select("*")
      .eq("novel_session_id", session.id)
      .order("scene_number");

    const results: Partial<Record<MbtiDimension, VoteChoice>> = {};
    for (const c of allChoices ?? []) {
      if (c.winning_choice) {
        results[c.mbti_dimension as MbtiDimension] = c.winning_choice;
      }
    }
    // 現在の投票も含める
    results[sceneChoice.mbti_dimension as MbtiDimension] = winner;

    const mbtiResult = calculateMbti(results);

    await supabase
      .from("novel_sessions")
      .update({ status: "generating", current_scene: nextScene, mbti_result: mbtiResult })
      .eq("id", session.id);
  } else {
    await supabase
      .from("novel_sessions")
      .update({ status: "generating", current_scene: nextScene })
      .eq("id", session.id);
  }
}
