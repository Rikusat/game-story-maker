"use client";

import { useEffect, useRef } from "react";

interface Props {
  text: string;
  isGenerating: boolean;
}

// ============================================================
// NovelViewer
//
// タイピング演出は page.tsx 側（animateText）で行う。
// このコンポーネントは受け取った text をそのまま表示するだけ。
// ============================================================
export default function NovelViewer({ text, isGenerating }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 自動スクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [text]);

  // 段落分割
  const paragraphs = text
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
          background: #faf8f4;
          scrollbar-width: thin;
          scrollbar-color: rgba(60,40,20,0.15) transparent;
        }
        .nv-root::-webkit-scrollbar { width: 3px; }
        .nv-root::-webkit-scrollbar-track { background: transparent; }
        .nv-root::-webkit-scrollbar-thumb {
          background: rgba(60,40,20,0.15);
          border-radius: 2px;
        }
        .nv-fade-top {
          position: sticky;
          top: 0;
          height: 60px;
          background: linear-gradient(to bottom, #faf8f4 0%, transparent 100%);
          pointer-events: none;
          z-index: 10;
          margin-bottom: -60px;
        }
        .nv-fade-bottom {
          position: sticky;
          bottom: 0;
          height: 80px;
          background: linear-gradient(to top, #faf8f4 0%, transparent 100%);
          pointer-events: none;
          z-index: 10;
          margin-top: -80px;
        }
        .nv-body {
          max-width: 600px;
          margin: 0 auto;
          padding: 3rem 1.75rem 5rem;
        }
        @keyframes nvFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .nv-para {
          font-family: 'Noto Serif JP', 'Hiragino Mincho ProN', serif;
          font-size: clamp(0.95rem, 2.4vw, 1.05rem);
          font-weight: 400;
          line-height: 2.3;
          letter-spacing: 0.06em;
          color: #1a1208;
          margin: 0 0 2em;
          text-align: justify;
          word-break: break-all;
          animation: nvFadeIn 0.6s ease both;
        }
        .nv-para:nth-child(1) { animation-delay: 0s; }
        .nv-para:nth-child(2) { animation-delay: 0.1s; }
        .nv-para:nth-child(3) { animation-delay: 0.2s; }
        .nv-para:nth-child(4) { animation-delay: 0.3s; }
        .nv-para:nth-child(5) { animation-delay: 0.4s; }
        .nv-para:nth-child(n+6) { animation-delay: 0.5s; }



        /* 和紙テクスチャ（薄いドット） */
        .nv-texture {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background-image: radial-gradient(
            circle, rgba(60,40,20,0.025) 1px, transparent 1px
          );
          background-size: 24px 24px;
        }
      `}</style>

      <div className="nv-texture" aria-hidden />

      <div className="nv-root">
        <div className="nv-fade-top" aria-hidden />

        <div className="nv-body">
          {paragraphs.map((para, i) => {
            const isLast = i === paragraphs.length - 1;
            return (
              <p key={i} className="nv-para">
                {para}

              </p>
            );
          })}

          <div ref={bottomRef} />
        </div>

        <div className="nv-fade-bottom" aria-hidden />
      </div>
    </>
  );
}
