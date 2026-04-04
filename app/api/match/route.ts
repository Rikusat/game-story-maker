import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

async function ensureProfile(supabase: ReturnType<typeof createAdminClient>, userId: string) {
  await supabase.from("profiles").upsert(
    { id: userId, username: "プレイヤー_" + userId.slice(0, 8) },
    { onConflict: "id" }
  );
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  const body = await request.json();
  const { action, userId } = body;

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  await ensureProfile(supabase, userId);

  // ── ルーム作成 ──────────────────────────────
  if (action === "create") {
    const { withBots } = body;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data: room, error } = await supabase
      .from("rooms")
      .insert({ code, host_id: userId })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("room_players").insert({ room_id: room.id, user_id: userId });

    if (withBots) {
      for (let i = 1; i <= 2; i++) {
        const botId = crypto.randomUUID();
        await supabase.from("profiles").upsert(
          { id: botId, username: `🤖ボット${i}` },
          { onConflict: "id" }
        );
        await supabase.from("room_players").insert({ room_id: room.id, user_id: botId });
      }
      await supabase.from("rooms").update({ status: "playing" }).eq("id", room.id);
      await supabase
        .from("novel_sessions")
        .insert({ room_id: room.id, status: "generating", current_page: 0 });
    }

    return NextResponse.json({ room });
  }

  // ── ルーム参加 ──────────────────────────────
  if (action === "join") {
    const { data: room, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", (body.code as string).toUpperCase())
      .eq("status", "waiting")
      .single();

    if (error || !room)
      return NextResponse.json({ error: "ルームが見つかりません" }, { status: 404 });

    const { data: players } = await supabase
      .from("room_players")
      .select("*")
      .eq("room_id", room.id)
      .eq("is_active", true);

    if ((players?.length ?? 0) >= room.max_players)
      return NextResponse.json({ error: "ルームが満員です" }, { status: 400 });

    await supabase
      .from("room_players")
      .upsert({ room_id: room.id, user_id: userId, is_active: true }, { onConflict: "room_id,user_id" });

    return NextResponse.json({ room });
  }

  // ── ゲーム開始（ホストのみ）─────────────────
  if (action === "start") {
    const { roomId } = body;

    const { data: room } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (!room || room.host_id !== userId)
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });

    await supabase.from("rooms").update({ status: "playing" }).eq("id", roomId);

    // ボットモードで既にセッションが存在する場合は再利用する
    const { data: existingSession } = await supabase
      .from("novel_sessions")
      .select("*")
      .eq("room_id", roomId)
      .maybeSingle();

    if (existingSession) {
      return NextResponse.json({ session: existingSession });
    }

    const { data: session } = await supabase
      .from("novel_sessions")
      .insert({ room_id: roomId, status: "generating", current_page: 0 })
      .select()
      .single();

    return NextResponse.json({ session });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
