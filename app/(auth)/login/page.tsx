"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (mode === "signup") {
        const { error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        if (signUpErr) throw signUpErr;
        // プロフィールの username を更新
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("profiles").upsert({ id: user.id, username });
        }
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) throw signInErr;
      }
      router.push("/lobby");
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center text-indigo-300 mb-2">📖</h1>
        <h2 className="text-2xl font-bold text-center text-gray-100 mb-8">
          Game Story Maker
        </h2>

        <div className="bg-gray-900 rounded-2xl p-8 shadow-2xl border border-gray-800">
          <div className="flex mb-6 bg-gray-800 rounded-lg p-1">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {m === "login" ? "ログイン" : "新規登録"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === "signup" && (
              <input
                type="text"
                placeholder="ユーザー名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="bg-gray-800 text-gray-100 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
              />
            )}
            <input
              type="email"
              placeholder="メールアドレス"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-gray-800 text-gray-100 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
            />
            <input
              type="password"
              placeholder="パスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="bg-gray-800 text-gray-100 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "処理中…" : mode === "login" ? "ログイン" : "登録する"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
