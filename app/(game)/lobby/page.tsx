"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function LobbyPage() {
  const supabase = createClient();
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    setLoading("create");
    setError("");
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const { room, error: err } = await res.json();
      if (err) throw new Error(err);
      router.push(`/room/${room.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading("join");
    setError("");
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", code: joinCode }),
      });
      const { room, error: err } = await res.json();
      if (err) throw new Error(err);
      router.push(`/room/${room.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
      <button
        onClick={handleLogout}
        className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 text-sm"
      >
        ログアウト
      </button>

      <h1 className="text-4xl font-bold text-indigo-300 mb-2">📖</h1>
      <h2 className="text-3xl font-bold text-gray-100 mb-2">Game Story Maker</h2>
      <p className="text-gray-400 mb-10 text-center">
        みんなで選ぶ、ひとつの物語
      </p>

      <div className="w-full max-w-sm flex flex-col gap-4">
        {/* ルーム作成 */}
        <button
          onClick={handleCreate}
          disabled={!!loading}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl text-lg transition-colors disabled:opacity-50"
        >
          {loading === "create" ? "作成中…" : "✦ ルームを作る"}
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-700" />
          <span className="text-gray-500 text-sm">または</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>

        {/* ルーム参加 */}
        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            type="text"
            placeholder="ルームコード（6桁）"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            required
            className="flex-1 bg-gray-800 text-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 uppercase tracking-widest"
          />
          <button
            type="submit"
            disabled={!!loading || joinCode.length < 6}
            className="bg-gray-700 hover:bg-gray-600 text-gray-100 font-bold px-5 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading === "join" ? "…" : "参加"}
          </button>
        </form>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        {/* 本棚へ */}
        <button
          onClick={() => router.push("/bookshelf")}
          className="text-gray-400 hover:text-gray-200 text-sm text-center mt-2"
        >
          📚 保存した物語を見る
        </button>
      </div>
    </div>
  );
}
