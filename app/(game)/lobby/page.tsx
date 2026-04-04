"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function getOrCreateUserId(): string {
  let id = localStorage.getItem("userId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("userId", id);
  }
  return id;
}

export default function LobbyPage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState<"create" | "solo" | "join" | null>(null);
  const [error, setError] = useState("");

  const handleCreate = async (withBots = false) => {
    setLoading(withBots ? "solo" : "create");
    setError("");
    try {
      const userId = getOrCreateUserId();
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", userId, withBots }),
      });
      const { room, error: err } = await res.json();
      if (err) throw new Error(err);
      if (withBots) {
        localStorage.setItem(`soloMode_${room.id}`, "1");
      }
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
      const userId = getOrCreateUserId();
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", code: joinCode, userId }),
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

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;500&display=swap');

        .lb-root {
          min-height: 100vh;
          background: #faf8f4;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.5rem;
          font-family: 'Noto Serif JP', 'Hiragino Mincho ProN', serif;
          position: relative;
        }
        .lb-texture {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background-image: radial-gradient(circle, rgba(60,40,20,0.025) 1px, transparent 1px);
          background-size: 24px 24px;
        }
        .lb-content {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 340px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .lb-title {
          font-size: clamp(1.7rem, 7vw, 2.2rem);
          font-weight: 400;
          color: #1a1208;
          letter-spacing: 0.2em;
          margin-bottom: 0.6rem;
          text-align: center;
        }
        .lb-divider {
          width: 40px;
          height: 1px;
          background: rgba(60,40,20,0.3);
          margin: 0 auto 0.8rem;
        }
        .lb-subtitle {
          font-size: 0.82rem;
          font-weight: 300;
          color: #8a6e50;
          letter-spacing: 0.15em;
          margin-bottom: 3rem;
          text-align: center;
        }
        .lb-btn {
          width: 100%;
          padding: 1rem 1.25rem;
          border-radius: 3px;
          font-family: 'Noto Serif JP', serif;
          font-size: 0.95rem;
          font-weight: 400;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: background 0.2s, opacity 0.2s;
          margin-bottom: 0.75rem;
        }
        .lb-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .lb-btn-primary {
          background: #2e1e0f;
          color: #f5efe4;
          border: none;
        }
        .lb-btn-primary:hover:not(:disabled) { background: #1e1208; }
        .lb-btn-secondary {
          background: transparent;
          color: #3d2b1a;
          border: 1px solid rgba(60,40,20,0.3);
        }
        .lb-btn-secondary:hover:not(:disabled) { background: rgba(60,40,20,0.06); }
        .lb-sep {
          display: flex;
          align-items: center;
          gap: 1rem;
          width: 100%;
          margin: 0.25rem 0 1rem;
        }
        .lb-sep-line { flex: 1; height: 1px; background: rgba(60,40,20,0.15); }
        .lb-sep-text { font-size: 0.75rem; color: #a08060; letter-spacing: 0.1em; }
        .lb-join-row { display: flex; gap: 0.5rem; width: 100%; }
        .lb-input {
          flex: 1;
          background: #f0ebe0;
          border: 1px solid rgba(60,40,20,0.2);
          border-radius: 3px;
          padding: 0.75rem 1rem;
          font-family: 'Noto Serif JP', serif;
          font-size: 0.95rem;
          color: #1a1208;
          outline: none;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          transition: border-color 0.15s;
        }
        .lb-input:focus { border-color: rgba(60,40,20,0.5); }
        .lb-input::placeholder { color: #b09878; font-size: 0.8rem; letter-spacing: 0.05em; text-transform: none; }
        .lb-join-btn {
          background: #f0ebe0;
          border: 1px solid rgba(60,40,20,0.2);
          border-radius: 3px;
          padding: 0.75rem 1.1rem;
          font-family: 'Noto Serif JP', serif;
          font-size: 0.9rem;
          color: #3d2b1a;
          cursor: pointer;
          transition: background 0.2s;
        }
        .lb-join-btn:hover:not(:disabled) { background: #e5ddd0; }
        .lb-join-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .lb-error { color: #8a2e20; font-size: 0.82rem; text-align: center; margin-top: 0.6rem; }
        .lb-link {
          background: none;
          border: none;
          color: #8a6e50;
          font-family: 'Noto Serif JP', serif;
          font-size: 0.8rem;
          cursor: pointer;
          letter-spacing: 0.1em;
          margin-top: 2rem;
          transition: color 0.2s;
        }
        .lb-link:hover { color: #1a1208; }
      `}</style>

      <div className="lb-texture" aria-hidden />

      <div className="lb-root">
        <div className="lb-content">
          <h1 className="lb-title">一期一会ノベル</h1>
          <div className="lb-divider" />
          <p className="lb-subtitle">みんなで選ぶ、ひとつの物語</p>

          <button
            onClick={() => handleCreate(false)}
            disabled={!!loading}
            className="lb-btn lb-btn-primary"
          >
            {loading === "create" ? "作成中…" : "ルームを作る（フレンドと）"}
          </button>

          <button
            onClick={() => handleCreate(true)}
            disabled={!!loading}
            className="lb-btn lb-btn-secondary"
          >
            {loading === "solo" ? "準備中…" : "ひとりで読む"}
          </button>

          <div className="lb-sep">
            <div className="lb-sep-line" />
            <span className="lb-sep-text">または</span>
            <div className="lb-sep-line" />
          </div>

          <form onSubmit={handleJoin} className="lb-join-row">
            <input
              type="text"
              placeholder="ルームコード（6桁）"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              required
              className="lb-input"
            />
            <button
              type="submit"
              disabled={!!loading || joinCode.length < 6}
              className="lb-join-btn"
            >
              {loading === "join" ? "…" : "参加"}
            </button>
          </form>

          {error && <p className="lb-error">{error}</p>}

          <button onClick={() => router.push("/bookshelf")} className="lb-link">
            保存した物語を見る
          </button>
        </div>
      </div>
    </>
  );
}
