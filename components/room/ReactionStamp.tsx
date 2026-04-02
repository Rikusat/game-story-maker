"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

interface FloatingStamp {
  id: number;
  emoji: string;
  x: number;
}

const STAMPS = ["😲", "🥺", "😂", "👏", "❤️", "🔥", "✨", "😱"];

interface Props {
  roomId: string;
}

export default function ReactionStamp({ roomId }: Props) {
  const supabase = createClient();
  const [floating, setFloating] = useState<FloatingStamp[]>([]);
  const counterRef = { current: 0 };

  const addStamp = useCallback((emoji: string) => {
    const id = Date.now() + Math.random();
    const x = 10 + Math.random() * 80;
    setFloating((f) => [...f, { id, emoji, x }]);
    setTimeout(() => setFloating((f) => f.filter((s) => s.id !== id)), 2000);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`stamps:${roomId}`)
      .on("broadcast", { event: "stamp" }, ({ payload }) => {
        addStamp(payload.emoji);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  const sendStamp = async (emoji: string) => {
    addStamp(emoji);
    await supabase.channel(`stamps:${roomId}`).send({
      type: "broadcast",
      event: "stamp",
      payload: { emoji },
    });
  };

  return (
    <>
      {/* フローティングスタンプ */}
      <div className="pointer-events-none fixed bottom-0 left-0 w-full h-full overflow-hidden">
        {floating.map((s) => (
          <div
            key={s.id}
            className="absolute text-3xl animate-bounce"
            style={{
              left: `${s.x}%`,
              bottom: "80px",
              animation: "floatUp 2s ease-out forwards",
            }}
          >
            {s.emoji}
          </div>
        ))}
      </div>

      {/* スタンプボタン */}
      <div className="flex flex-wrap gap-2 justify-center">
        {STAMPS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => sendStamp(emoji)}
            className="text-xl hover:scale-125 transition-transform cursor-pointer select-none"
          >
            {emoji}
          </button>
        ))}
      </div>

      <style jsx>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-200px) scale(1.3); opacity: 0; }
        }
      `}</style>
    </>
  );
}
