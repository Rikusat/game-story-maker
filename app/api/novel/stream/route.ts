import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@/lib/claude";
import { buildStoryPrompt } from "@/lib/claude/prompts";
import { MBTI_SCENES } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { sessionId, sceneNumber, previousChoiceText } = await request.json();

  const { data: session } = await supabase
    .from("novel_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) return new Response("Session not found", { status: 404 });

  const isLastScene = sceneNumber >= 3;
  const prompt = buildStoryPrompt({
    previousText: session.full_text,
    sceneNumber,
    isLastScene,
    previousChoiceText,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "あなたは日本語のインタラクティブノベルゲームのシナリオライターです。指示に従い、指定フォーマットで出力してください。",
            },
            { role: "user", content: prompt },
          ],
          stream: true,
          max_tokens: 800,
          temperature: 0.85,
        });

        let rawBuffer = "";
        let storyBuffer = "";
        let choicesStarted = false;
        let lastDbUpdate = Date.now();

        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content ?? "";
          if (!content) continue;
          rawBuffer += content;

          if (!choicesStarted) {
            const delimIdx = rawBuffer.indexOf("===");
            if (delimIdx !== -1) {
              // 区切り文字以前のストーリーテキストを確定
              choicesStarted = true;
              const newText = rawBuffer.substring(storyBuffer.length, delimIdx);
              if (newText) {
                storyBuffer += newText;
                send({ type: "chunk", content: newText });
              }
            } else {
              // ストーリーテキストをストリーム
              storyBuffer += content;
              send({ type: "chunk", content });

              // 1秒ごとにDBへ中間保存（他プレイヤーのリアルタイム表示用）
              if (Date.now() - lastDbUpdate > 1000) {
                lastDbUpdate = Date.now();
                const accumulated =
                  (session.full_text ? session.full_text + "\n\n" : "") +
                  storyBuffer;
                await supabase
                  .from("novel_sessions")
                  .update({ full_text: accumulated })
                  .eq("id", sessionId);
              }
            }
          }
        }

        const newFullText =
          (session.full_text ? session.full_text + "\n\n" : "") + storyBuffer;

        if (isLastScene) {
          // ===END=== — 物語完結
          await supabase
            .from("novel_sessions")
            .update({ full_text: newFullText, status: "completed" })
            .eq("id", sessionId);

          await supabase
            .from("rooms")
            .update({ status: "finished" })
            .eq("id", session.room_id);

          send({ type: "done", completed: true });
        } else {
          // ===CHOICES=== を解析
          const choicesIdx = rawBuffer.indexOf("===CHOICES===");
          let parsedChoices: { choice_a: string; choice_b: string } | null = null;

          if (choicesIdx !== -1) {
            const jsonStr = rawBuffer
              .substring(choicesIdx + 13)
              .replace(/===END===/g, "")
              .trim();
            try {
              parsedChoices = JSON.parse(jsonStr);
            } catch {
              // フォールバック選択肢
              parsedChoices = {
                choice_a: "前に進む",
                choice_b: "立ち止まって考える",
              };
            }
          }

          const sceneConfig = MBTI_SCENES[sceneNumber];
          const deadline = new Date(Date.now() + 30_000).toISOString();

          const { data: sceneChoice } = await supabase
            .from("scene_choices")
            .insert({
              novel_session_id: sessionId,
              scene_number: sceneNumber,
              story_segment: storyBuffer,
              choice_a: parsedChoices?.choice_a ?? "前に進む",
              choice_b: parsedChoices?.choice_b ?? "立ち止まる",
              mbti_dimension: sceneConfig.dimension,
              choice_a_type: sceneConfig.typeA,
              choice_b_type: sceneConfig.typeB,
              vote_deadline: deadline,
            })
            .select()
            .single();

          await supabase
            .from("novel_sessions")
            .update({ full_text: newFullText, status: "choice" })
            .eq("id", sessionId);

          send({
            type: "done",
            sceneChoiceId: sceneChoice?.id,
            deadline,
          });
        }
      } catch (err) {
        send({ type: "error", message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
