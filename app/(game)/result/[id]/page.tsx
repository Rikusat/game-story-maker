import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import SaveButton from "./SaveButton";
import { MBTI_SCENES, calculateMbti } from "@/types";
import type { MbtiDimension, VoteChoice } from "@/types";

const MBTI_DESC: Record<string, { title: string; desc: string }> = {
  INTJ: { title: "建築家", desc: "独創的な思考と冷静な分析力を持つ稀有なビジョナリー。" },
  INTP: { title: "論理学者", desc: "知識への飽くなき渇望を持つ革新的な発明家。" },
  ENTJ: { title: "指揮官", desc: "意志が強く、創意工夫に溢れる自信家のリーダー。" },
  ENTP: { title: "討論者", desc: "知的な挑戦と討論を好む、賢く好奇心旺盛な思想家。" },
  INFJ: { title: "提唱者", desc: "理想主義的な信念を持ち、静かな情熱で物事を進める。" },
  INFP: { title: "仲介者", desc: "詩的・親切・利他的で、善のためなら力を尽くす。" },
  ENFJ: { title: "主人公", desc: "カリスマ性と影響力を持つ、人々を鼓舞するリーダー。" },
  ENFP: { title: "広報運動家", desc: "自由な精神と創造的な思考で人生を楽しむ楽観主義者。" },
  ISTJ: { title: "管理者", desc: "事実を重視する、信頼性の高い実直な管理者。" },
  ISFJ: { title: "擁護者", desc: "非常に献身的で温かく、常に大切な人を守ろうとする。" },
  ESTJ: { title: "幹部", desc: "秩序と管理を重視し、伝統を大切にする優秀な管理者。" },
  ESFJ: { title: "領事官", desc: "思いやりがあり社交的で、人気者になりやすい。" },
  ISTP: { title: "巨匠", desc: "大胆かつ実践的な実験者。多様なツールを使いこなす。" },
  ISFP: { title: "冒険家", desc: "柔軟で魅力的な芸術家。いつも新しいことを探している。" },
  ESTP: { title: "起業家", desc: "賢く、精力的で知覚力が高く、危険を楽しめる。" },
  ESFP: { title: "エンターテイナー", desc: "自発的・精力的・熱狂的。人生は楽しむためにある。" },
};

export default async function ResultPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const roomId = params.id;

  // セッション取得
  const { data: session } = await supabase
    .from("novel_sessions")
    .select("*")
    .eq("room_id", roomId)
    .single();

  if (!session) redirect("/lobby");

  // 全シーンの選択肢と投票を取得
  const { data: choices } = await supabase
    .from("scene_choices")
    .select("*, votes(*)")
    .eq("novel_session_id", session.id)
    .order("scene_number");

  // MBTI 再計算
  const results: Partial<Record<MbtiDimension, VoteChoice>> = {};
  for (const c of choices ?? []) {
    if (c.winning_choice) {
      results[c.mbti_dimension as MbtiDimension] = c.winning_choice as VoteChoice;
    }
  }
  const mbti = session.mbti_result ?? calculateMbti(results);
  const mbtiInfo = MBTI_DESC[mbti];

  // プレイヤー数
  const { data: players } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", roomId);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 px-4 py-12">
      <div className="max-w-2xl mx-auto">
        {/* MBTI 結果 */}
        <div className="text-center mb-12">
          <p className="text-gray-400 mb-2">みんなの選択が導いた個性タイプ</p>
          <h1 className="text-7xl font-extrabold text-indigo-300 tracking-widest mb-2">
            {mbti}
          </h1>
          {mbtiInfo && (
            <>
              <h2 className="text-2xl font-bold text-gray-100 mb-2">
                {mbtiInfo.title}
              </h2>
              <p className="text-gray-400 max-w-md mx-auto">{mbtiInfo.desc}</p>
            </>
          )}
        </div>

        {/* 各シーンの投票結果 */}
        <div className="flex flex-col gap-4 mb-10">
          <h3 className="text-gray-300 font-semibold text-lg">投票の記録</h3>
          {(choices ?? []).map((c, i) => {
            const totalVotes = c.votes?.length ?? 0;
            const countA = c.votes?.filter((v: any) => v.choice === "A").length ?? 0;
            const countB = totalVotes - countA;
            const pctA = totalVotes ? Math.round((countA / totalVotes) * 100) : 50;
            const scene = MBTI_SCENES[i];

            return (
              <div key={c.id} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-indigo-400 text-sm font-medium">
                    シーン {i + 1} — {scene?.label}
                  </span>
                  <span className="text-gray-500 text-xs">{totalVotes}票</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(["A", "B"] as const).map((v) => {
                    const label = v === "A" ? c.choice_a : c.choice_b;
                    const count = v === "A" ? countA : countB;
                    const pct = v === "A" ? pctA : 100 - pctA;
                    const won = c.winning_choice === v;
                    return (
                      <div
                        key={v}
                        className={`rounded-lg p-3 border ${
                          won
                            ? "border-indigo-500 bg-indigo-900/30"
                            : "border-gray-700 bg-gray-800/40"
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs text-gray-400">選択 {v}</span>
                          {won && <span className="text-xs text-indigo-300">✓ 採用</span>}
                        </div>
                        <p className="text-sm text-gray-200 mb-2">{label}</p>
                        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${won ? "bg-indigo-400" : "bg-gray-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{count}票 ({pct}%)</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* アクション */}
        <div className="flex flex-col gap-3">
          <SaveButton sessionId={session.id} existingTitle={session.title} />
          <Link
            href="/lobby"
            className="block text-center bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold py-3 rounded-xl transition-colors"
          >
            ロビーに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
