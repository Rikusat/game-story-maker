import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function BookshelfPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: saved } = await supabase
    .from("saved_novels")
    .select("*, novel_sessions(*)")
    .eq("user_id", user.id)
    .order("saved_at", { ascending: false });

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-100">📚 あなたの本棚</h1>
          <Link
            href="/lobby"
            className="text-gray-400 hover:text-gray-200 text-sm"
          >
            ← ロビーへ
          </Link>
        </div>

        {(!saved || saved.length === 0) ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">📖</p>
            <p className="text-gray-400">まだ保存した物語はありません</p>
            <Link
              href="/lobby"
              className="inline-block mt-4 text-indigo-400 hover:text-indigo-300"
            >
              新しい物語を始める →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {saved.map((s) => {
              const session = s.novel_sessions;
              const mbti = session?.mbti_result;
              const preview = session?.full_text?.substring(0, 100) ?? "";
              return (
                <Link
                  key={s.id}
                  href={`/result/${session?.room_id}`}
                  className="bg-gray-900 border border-gray-800 hover:border-indigo-700 rounded-xl p-5 transition-colors block"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h2 className="text-gray-100 font-semibold text-lg">{s.title}</h2>
                    {mbti && (
                      <span className="text-indigo-400 font-bold text-sm bg-indigo-900/40 px-2 py-0.5 rounded">
                        {mbti}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {preview}
                    {preview.length >= 100 && "…"}
                  </p>
                  <p className="text-gray-600 text-xs mt-3">
                    {new Date(s.saved_at).toLocaleDateString("ja-JP")}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
