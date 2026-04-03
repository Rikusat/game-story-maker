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
        }

        /* カーソル（生成中のみ） */
        @keyframes nvCursorBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        .nv-cursor {
          display: inline-block;
          width: 2px;
          height: 1em;
          background: #8b6914;
          margin-left: 2px;
          vertical-align: text-bottom;
          animation: nvCursorBlink 1s step-end infinite;
        }

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
                {/* カーソルは最後の段落・生成中のみ表示 */}
                {isLast && isGenerating && (
                  <span className="nv-cursor" aria-hidden />
                )}
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
