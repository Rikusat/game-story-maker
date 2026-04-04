import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { tallyAndAdvance } from "@/lib/game/tally";

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  const body     = await request.json();

  // ── テキストページ「次へ」（player-ready） ───────────────
  if (body.action === "player-ready") {
    const { sessionId, roomId, userId, pageNumber } = body;

    // このプレイヤーを ready にする
    await supabase
      .from("room_players")
      .update({ ready_page: pageNumber })
      .eq("room_id", roomId)
      .eq("user_id", userId);

    // 全プレイヤーの ready 状態を確認
    const { data: allPlayers } = await supabase
      .from("room_players")
      .select("user_id, ready_page, is_bot")
      .eq("room_id", roomId)
      .eq("is_active", true);

    // 人間プレイヤーが全員 ready かチェック（is_bot で確実に判定）
    const humanPlayers = (allPlayers ?? []).filter(
      (p: any) => !p.is_bot
    );
    const allReady =
      humanPlayers.length > 0 &&
      humanPlayers.every((p: any) => (p.ready_page ?? -1) >= pageNumber);

    if (allReady) {
      // ページ進行（冪等）
      const { data: session } = await supabase
        .from("novel_sessions")
        .select("current_page")
        .eq("id", sessionId)
        .single();
      if (session && session.current_page <= pageNumber) {
        await supabase
          .from("novel_sessions")
          .update({ current_page: pageNumber + 1, status: "generating" })
          .eq("id", sessionId);
      }
    }

    return NextResponse.json({ ok: true, allReady });
  }

  // ── 投票 ────────────────────────────────────────────────
  const { sceneChoiceId, choice, roomId, userId } = body;

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const { error } = await supabase.from("votes").upsert(
    { scene_choice_id: sceneChoiceId, room_id: roomId, user_id: userId, choice },
    { onConflict: "scene_choice_id,user_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ルームの全プレイヤーを取得（is_bot で確実にボット判定）
  const { data: allPlayers } = await supabase
    .from("room_players")
    .select("user_id, is_bot")
    .eq("room_id", roomId)
    .eq("is_active", true);

  const botIds   = (allPlayers ?? []).filter((p: any) => p.is_bot).map((p: any) => p.user_id as string);
  const humanIds = (allPlayers ?? []).filter((p: any) => !p.is_bot).map((p: any) => p.user_id as string);

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
  const allVoted     = humanIds.every((id) => votedUserIds.includes(id));

  if (allVoted) {
    await tallyAndAdvance(supabase, sceneChoiceId, roomId);
  }

  const { data: session } = await supabase
    .from("novel_sessions").select("current_page, status")
    .eq("room_id", roomId).single();

  return NextResponse.json({
    ok:        true,
    nextPage:  session?.current_page ?? 0,
    completed: session?.status === "completed",
  });
}

export async function PUT(request: NextRequest) {
  const supabase = createAdminClient();
  const body     = await request.json();

  // テキストページの進行（全員「次へ」押下 or タイムアウト）
  if (body.action === "advance-page") {
    const { sessionId, nextPage } = body;
    const { data: session } = await supabase
      .from("novel_sessions")
      .select("current_page")
      .eq("id", sessionId)
      .single();

    // 冪等性確保：既に進んでいれば何もしない
    if (session && session.current_page < nextPage) {
      await supabase
        .from("novel_sessions")
        .update({ current_page: nextPage, status: "generating" })
        .eq("id", sessionId);
    }
    return NextResponse.json({ ok: true });
  }

  // CHOICEページのタイムアウト集計
  const { sceneChoiceId, roomId } = body;
  await tallyAndAdvance(supabase, sceneChoiceId, roomId);
  return NextResponse.json({ ok: true });
}
