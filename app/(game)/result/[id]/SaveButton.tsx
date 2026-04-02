"use client";

import { useState } from "react";

interface Props {
  sessionId: string;
  existingTitle?: string | null;
}

export default function SaveButton({ sessionId, existingTitle }: Props) {
  const [saved, setSaved] = useState(!!existingTitle);
  const [title, setTitle] = useState(existingTitle ?? "");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, customTitle: title || undefined }),
      });
      const data = await res.json();
      setTitle(data.title);
      setSaved(true);
      setEditing(false);
    } finally {
      setLoading(false);
    }
  };

  if (saved && !editing) {
    return (
      <div className="bg-gray-900 border border-indigo-700 rounded-xl p-4 text-center">
        <p className="text-indigo-300 text-sm mb-1">✓ 本棚に保存済み</p>
        <p className="text-gray-100 font-semibold">{title}</p>
        <button
          onClick={() => setEditing(true)}
          className="text-gray-500 text-xs mt-2 hover:text-gray-300"
        >
          タイトルを変更
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {editing && (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="タイトルを入力（空欄でAI生成）"
          className="bg-gray-800 text-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
        />
      )}
      <button
        onClick={editing ? handleSave : () => setEditing(true)}
        disabled={loading}
        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
      >
        {loading ? "保存中…" : saved ? "タイトルを更新" : "📚 本棚に保存"}
      </button>
    </div>
  );
}
