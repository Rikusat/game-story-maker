import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { action } = body;

  // ── ルーム作成 ──────────────────────────────
  if (action === "create") {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data: room, error } = await supabase
      .from("rooms")
      .insert({ code, host_id: user.id })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("room_players").insert({ room_id: room.id, user_id: user.id });
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
      .upsert({ room_id: room.id, user_id: user.id, is_active: true });

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

    if (!room || room.host_id !== user.id)
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });

    await supabase.from("rooms").update({ status: "playing" }).eq("id", roomId);

    const { data: session } = await supabase
      .from("novel_sessions")
      .insert({ room_id: roomId, status: "generating", current_scene: 0 })
      .select()
      .single();

    return NextResponse.json({ session });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
