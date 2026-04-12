import type {
  TopicSetWithStats,
  CreateTopicSetRequest,
  GenerateTopicsResponse,
} from "@wordninja/shared"

const BASE = "/admin/api"

export async function fetchTopicSets(): Promise<TopicSetWithStats[]> {
  const res = await fetch(`${BASE}/topic-sets`)
  return res.json()
}

export async function createTopicSet(
  words: string[],
): Promise<{ id: string }> {
  const body: CreateTopicSetRequest = { words }
  const res = await fetch(`${BASE}/topic-sets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function deleteTopicSet(id: string): Promise<void> {
  await fetch(`${BASE}/topic-sets/${id}`, { method: "DELETE" })
}

export async function generateCandidates(): Promise<GenerateTopicsResponse> {
  const res = await fetch(`${BASE}/generate`, { method: "POST" })
  return res.json()
}
