import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@/lib/claude";
import { buildTitlePrompt } from "@/lib/claude/prompts";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId, customTitle } = await request.json();

  const { data: session } = await supabase
    .from("novel_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  let title = customTitle;

  // タイトルが未指定なら GPT で生成
  if (!title) {
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "user", content: buildTitlePrompt(session.full_text) },
        ],
        max_tokens: 30,
        temperature: 0.7,
      });
      title = res.choices[0].message.content?.trim() ?? "名もなき物語";
    } catch {
      title = "名もなき物語";
    }
  }

  // タイトルを novel_sessions に保存
  await supabase
    .from("novel_sessions")
    .update({ title })
    .eq("id", sessionId);

  // 本棚に保存（重複は upsert）
  const { data: saved, error } = await supabase
    .from("saved_novels")
    .upsert({ novel_session_id: sessionId, user_id: user.id, title })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ saved, title });
}
