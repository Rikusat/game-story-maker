import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { openai } from "@/lib/claude";
import { buildTitlePrompt } from "@/lib/claude/prompts";

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  const { sessionId, customTitle, userId } = await request.json();

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

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

  await supabase
    .from("novel_sessions")
    .update({ title })
    .eq("id", sessionId);

  const { data: saved, error } = await supabase
    .from("saved_novels")
    .upsert(
      { novel_session_id: sessionId, user_id: userId, title },
      { onConflict: "novel_session_id,user_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ saved, title });
}
