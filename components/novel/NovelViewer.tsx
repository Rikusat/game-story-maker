"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  text: string;
  isGenerating: boolean;
  /** ホストの場合、SSE ストリームの URL（sessionId + sceneNumber）を渡す */
  streamUrl?: string | null;
  onStreamChunk?: (chunk: string) => void;
  onStreamDone?: (data: { sceneChoiceId?: string; deadline?: string; completed?: boolean }) => void;
}

export default function NovelViewer({
  text,
  isGenerating,
  streamUrl,
  onStreamChunk,
  onStreamDone,
}: Props) {
  const [displayed, setDisplayed] = useState("");
  const [cursor, setCursor] = useState(true);
  const prevTextRef = useRef("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // タイプライター演出
  useEffect(() => {
    if (text === prevTextRef.current) return;
    const newChars = text.slice(prevTextRef.current.length);
    prevTextRef.current = text;

    let i = 0;
    const interval = setInterval(() => {
      if (i >= newChars.length) {
        clearInterval(interval);
        return;
      }
      setDisplayed((d) => d + newChars[i]);
      i++;
    }, 28);

    return () => clearInterval(interval);
  }, [text]);

  // カーソル点滅
  useEffect(() => {
    const t = setInterval(() => setCursor((c) => !c), 500);
    return () => clearInterval(t);
  }, []);

  // SSE ストリーム（ホスト用）
  useEffect(() => {
    if (!streamUrl) return;
    const ctrl = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/novel/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: streamUrl,
          signal: ctrl.signal,
        });

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const lines = decoder.decode(value).split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "chunk" && onStreamChunk) onStreamChunk(data.content);
              if (data.type === "done" && onStreamDone) onStreamDone(data);
            } catch {}
          }
        }
      } catch (e: any) {
        if (e.name !== "AbortError") console.error(e);
      }
    })();

    return () => ctrl.abort();
  }, [streamUrl]);

  // 自動スクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayed]);

  return (
    <div className="relative h-full overflow-y-auto px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <p className="text-gray-100 text-lg leading-relaxed whitespace-pre-wrap font-serif">
          {displayed}
          {isGenerating && (
            <span className={`inline-block w-0.5 h-5 bg-indigo-400 ml-0.5 ${cursor ? "opacity-100" : "opacity-0"}`} />
          )}
        </p>
        {isGenerating && !displayed && (
          <div className="flex items-center gap-3 text-gray-400 mt-4">
            <span className="animate-spin text-2xl">✦</span>
            <span>物語を紡いでいます…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
