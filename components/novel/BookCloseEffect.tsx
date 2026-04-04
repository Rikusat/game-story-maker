"use client";

import { useEffect, useState } from "react";

interface Props {
  onDone: () => void;
}

export default function BookCloseEffect({ onDone }: Props) {
  const [phase, setPhase] = useState<"open" | "closing" | "closed">("open");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("closing"), 500);
    const t2 = setTimeout(() => {
      setPhase("closed");
      onDone();
    }, 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950">
      <div
        className={`relative transition-all duration-700 ${
          phase === "closing" ? "scale-110 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        {/* 本のアイコン */}
        <div className="text-8xl text-center select-none">📖</div>
        <p className="text-center text-gray-300 mt-4 text-lg">物語が幕を閉じる…</p>
      </div>
    </div>
  );
}
