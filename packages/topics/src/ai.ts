import { EMBED_MODEL } from "./config";

// Workers AI で語をベクトル化。bge-m3 は { data: number[][] } を返す。
export async function embedTexts(ai: Ai, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = (await ai.run(EMBED_MODEL, { text: texts })) as {
    data: number[][];
  };
  return res.data;
}
