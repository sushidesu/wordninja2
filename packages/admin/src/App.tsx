import { useCallback, useEffect, useState } from "react"
import type { TopicSetWithStats } from "@wordninja/shared"
import {
  fetchTopicSets,
  createTopicSet,
  deleteTopicSet,
  generateCandidates,
} from "./api"

function wilsonScore(up: number, down: number): number {
  const n = up + down
  if (n === 0) return 0
  const z = 1.96
  const p = up / n
  return (
    (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) /
    (1 + (z * z) / n)
  )
}

function App() {
  const [topicSets, setTopicSets] = useState<TopicSetWithStats[]>([])
  const [candidates, setCandidates] = useState<string[][]>([])
  const [manualInput, setManualInput] = useState("")
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    const data = await fetchTopicSets()
    setTopicSets(data)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const handleGenerate = async () => {
    setLoading(true)
    const res = await generateCandidates()
    setCandidates(res.candidates)
    setLoading(false)
  }

  const handleApprove = async (words: string[]) => {
    await createTopicSet(words)
    setCandidates((prev) => prev.filter((c) => c !== words))
    await reload()
  }

  const handleReject = (words: string[]) => {
    setCandidates((prev) => prev.filter((c) => c !== words))
  }

  const handleDelete = async (id: string) => {
    await deleteTopicSet(id)
    await reload()
  }

  const handleManualAdd = async () => {
    const words = manualInput
      .split(",")
      .map((w) => w.trim())
      .filter((w) => w.length > 0)
    if (words.length < 2) return
    await createTopicSet(words)
    setManualInput("")
    await reload()
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900">WordNinja Admin</h1>

        {/* 手動追加 */}
        <section className="mt-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleManualAdd()
              }}
              placeholder="カンマ区切りで追加: 温泉, サウナ, 岩盤浴"
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleManualAdd}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              追加
            </button>
          </div>
        </section>

        {/* 候補生成 */}
        <section className="mt-6">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? "生成中..." : "LLMで候補を生成"}
          </button>

          {candidates.length > 0 && (
            <div className="mt-3 space-y-2">
              {candidates.map((words, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded border border-purple-200 bg-purple-50 px-4 py-3"
                >
                  <div className="flex flex-1 flex-wrap gap-1">
                    {words.map((w, j) => (
                      <span
                        key={j}
                        className="rounded bg-white px-2 py-0.5 text-sm border border-purple-200"
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => handleApprove(words)}
                    className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                  >
                    承認
                  </button>
                  <button
                    onClick={() => handleReject(words)}
                    className="rounded bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                  >
                    却下
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* TopicSet 一覧 */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">
            TopicSet ({topicSets.length})
          </h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-left text-xs font-medium text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2">Words</th>
                  <th className="px-4 py-2 w-16 text-center">語数</th>
                  <th className="px-4 py-2 w-16 text-center">Play</th>
                  <th className="px-4 py-2 w-12 text-center">👍</th>
                  <th className="px-4 py-2 w-12 text-center">👎</th>
                  <th className="px-4 py-2 w-20 text-center">Score</th>
                  <th className="px-4 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {topicSets.map((ts) => {
                  const score = wilsonScore(ts.upvotes, ts.downvotes)
                  const hasVotes = ts.upvotes + ts.downvotes > 0
                  return (
                    <tr key={ts.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {ts.words.map((w) => (
                            <span
                              key={w.id}
                              className="rounded bg-gray-100 px-2 py-0.5 text-sm"
                            >
                              {w.text}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center text-gray-500">
                        {ts.words.length}
                      </td>
                      <td className="px-4 py-2 text-center">{ts.playCount}</td>
                      <td className="px-4 py-2 text-center text-green-600">
                        {ts.upvotes}
                      </td>
                      <td className="px-4 py-2 text-center text-red-500">
                        {ts.downvotes}
                      </td>
                      <td className="px-4 py-2 text-center font-mono text-xs">
                        {hasVotes ? score.toFixed(2) : "-"}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => handleDelete(ts.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
