"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  text: string;
  isGenerating: boolean;
  streamUrl?: string | null;
  onStreamChunk?: (chunk: string) => void;
  onStreamDone?: (data: {
    sceneChoiceId?: string;
    deadline?: string;
    completed?: boolean;
  }) => void;
}

export default function NovelViewer({
  text,
  isGenerating,
  streamUrl,
  onStreamChunk,
  onStreamDone,
}: Props) {
  const [displayed, setDisplayed] = useState("");
  const [cursor, setCursor]       = useState(true);
  const prevTextRef               = useRef("");
  const bottomRef                 = useRef<HTMLDivElement>(null);

  // ── タイプライター演出（既存ロジック維持） ──
  useEffect(() => {
    if (text === prevTextRef.current) return;
    const newChars = text.slice(prevTextRef.current.length);
    prevTextRef.current = text;
    let i = 0;
    const interval = setInterval(() => {
      if (i >= newChars.length) { clearInterval(interval); return; }
      setDisplayed((d) => d + newChars[i]);
      i++;
    }, 28);
    return () => clearInterval(interval);
  }, [text]);

  // ── カーソル点滅 ──
  useEffect(() => {
    const t = setInterval(() => setCursor((c) => !c), 530);
    return () => clearInterval(t);
  }, []);

  // ── SSE ストリーム（ホスト用・既存ロジック維持） ──
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
        const reader  = res.body!.getReader();
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
              if (data.type === "done"  && onStreamDone)  onStreamDone(data);
              if (data.type === "error" && onStreamDone)  onStreamDone({});
            } catch {}
          }
        }
      } catch (e: any) {
        if (e.name !== "AbortError") console.error(e);
      }
    })();
    return () => ctrl.abort();
  }, [streamUrl]);

  // ── 自動スクロール ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayed]);

  // 段落に分割
  const paragraphs = displayed
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400&family=Shippori+Mincho:wght@400;500&display=swap');

        .nv-root {
          position: relative;
          height: 100%;
          overflow-y: auto;
          background: #0e0c0a;
          scrollbar-width: thin;
          scrollbar-color: rgba(200,185,154,0.15) transparent;
        }
        .nv-root::-webkit-scrollbar { width: 3px; }
        .nv-root::-webkit-scrollbar-track { background: transparent; }
        .nv-root::-webkit-scrollbar-thumb {
          background: rgba(200,185,154,0.2);
          border-radius: 2px;
        }
        .nv-fade-top {
          position: sticky;
          top: 0;
          height: 72px;
          background: linear-gradient(to bottom, #0e0c0a 0%, transparent 100%);
          pointer-events: none;
          z-index: 10;
          margin-bottom: -72px;
        }
        .nv-fade-bottom {
          position: sticky;
          bottom: 0;
          height: 100px;
          background: linear-gradient(to top, #0e0c0a 0%, transparent 100%);
          pointer-events: none;
          z-index: 10;
          margin-top: -100px;
        }
        .nv-body {
          max-width: 600px;
          margin: 0 auto;
          padding: 4rem 1.75rem 6rem;
        }
        .nv-para {
          font-family: 'Noto Serif JP', 'Hiragino Mincho ProN', serif;
          font-size: clamp(0.95rem, 2.4vw, 1.05rem);
          font-weight: 300;
          line-height: 2.3;
          letter-spacing: 0.06em;
          color: #f0ead8;
          margin: 0 0 2em;
          text-align: justify;
          word-break: break-all;
        }
        @keyframes inkBleed {
          0%   { opacity: 0; filter: blur(4px); transform: scale(0.93); }
          60%  { opacity: 0.9; filter: blur(0.4px); transform: scale(1.01); }
          100% { opacity: 1; filter: blur(0); transform: scale(1); }
        }
        .nv-char {
          display: inline;
          animation: inkBleed 0.32s ease-out both;
        }
        @keyframes nvCursorBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        .nv-cursor {
          display: inline-block;
          width: 1px;
          height: 1em;
          background: #c8b99a;
          margin-left: 2px;
          vertical-align: text-bottom;
          animation: nvCursorBlink 1.06s step-end infinite;
        }
        @keyframes nvDotPulse {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50%       { opacity: 0.8; transform: scale(1); }
        }
        .nv-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: rgba(200,185,154,0.5);
          animation: nvDotPulse 1.2s ease-in-out infinite;
        }
        .nv-dot:nth-child(2) { animation-delay: 0.2s; }
        .nv-dot:nth-child(3) { animation-delay: 0.4s; }
        .nv-washi {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background-image: radial-gradient(
            circle, rgba(200,185,154,0.03) 1px, transparent 1px
          );
          background-size: 28px 28px;
        }
        @media (prefers-reduced-motion: reduce) {
          .nv-char   { animation: none; opacity: 1; filter: none; }
          .nv-cursor { animation: none; opacity: 1; }
          .nv-dot    { animation: none; opacity: 0.5; }
        }
      `}</style>

      <div className="nv-washi" aria-hidden />

      <div className="nv-root">
        <div className="nv-fade-top" aria-hidden />

        <div className="nv-body">
          {paragraphs.map((para, i) => {
            const isLast = i === paragraphs.length - 1;
            return (
              <p key={i} className="nv-para">
                {isLast && isGenerating ? (
                  <>
                    {[...para].map((ch, j) => (
                      <span
                        key={j}
                        className="nv-char"
                        style={{ animationDelay: `${Math.min(j * 0.008, 0.25)}s` }}
                      >
                        {ch}
                      </span>
                    ))}
                    <span className="nv-cursor" aria-hidden />
                  </>
                ) : (
                  para
                )}
              </p>
            );
          })}

          {isGenerating && !displayed && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginTop: "3rem",
              fontFamily: "'Shippori Mincho', serif",
              fontSize: "0.8rem",
              letterSpacing: "0.2em",
              color: "rgba(200,185,154,0.4)",
            }}>
              <span className="nv-dot" />
              <span className="nv-dot" />
              <span className="nv-dot" />
              <span style={{ marginLeft: "4px" }}>物語を紡いでいます</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="nv-fade-bottom" aria-hidden />
      </div>
    </>
  );
}
