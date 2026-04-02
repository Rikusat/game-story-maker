"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Room, RoomPlayer, NovelSession, SceneChoice } from "@/types";

export function useRoom(roomId: string) {
  const supabase = createClient();
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [session, setSession] = useState<NovelSession | null>(null);
  const [currentChoice, setCurrentChoice] = useState<SceneChoice | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchAll = async () => {
    const [{ data: r }, { data: p }, { data: s }] = await Promise.all([
      supabase.from("rooms").select("*").eq("id", roomId).single(),
      supabase
        .from("room_players")
        .select("*, profiles(*)")
        .eq("room_id", roomId)
        .eq("is_active", true),
      supabase.from("novel_sessions").select("*").eq("room_id", roomId).maybeSingle(),
    ]);
    if (r) setRoom(r as Room);
    if (p) setPlayers(p as RoomPlayer[]);
    if (s) setSession(s as NovelSession);
  };

  const fetchCurrentChoice = async (sessionId: string, sceneNumber: number) => {
    const { data } = await supabase
      .from("scene_choices")
      .select("*")
      .eq("novel_session_id", sessionId)
      .eq("scene_number", sceneNumber)
      .maybeSingle();
    setCurrentChoice(data as SceneChoice | null);
  };

  useEffect(() => {
    if (!roomId) return;
    fetchAll();

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => setRoom(payload.new as Room)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "novel_sessions", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const s = payload.new as NovelSession;
          setSession(s);
          if (s.status === "choice") {
            fetchCurrentChoice(s.id, s.current_scene - 1);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scene_choices" },
        (payload) => {
          const c = payload.new as SceneChoice;
          setCurrentChoice(c);
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // session が変わったとき choice を取得
  useEffect(() => {
    if (session?.status === "choice") {
      fetchCurrentChoice(session.id, session.current_scene - 1);
    } else {
      setCurrentChoice(null);
    }
  }, [session?.status, session?.current_scene]);

  return { room, players, session, currentChoice, refetch: fetchAll };
}
