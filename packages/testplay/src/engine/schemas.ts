// LLM コールの構造化出力スキーマ(claude -p --json-schema でサーバ側強制)。
// workflow 版から移植。GUESS_VERDICT に reasoning を追加(判定根拠の観測)。
const VALUE_ENUM = ['はい', 'いいえ', '部分的にそう', 'わからない']

export const BELIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          word: { type: 'string' },
          prob: { type: 'number', description: '相対的なもっともらしさ(合計約1)' },
        },
        required: ['word', 'prob'],
      },
    },
  },
  required: ['candidates'],
}

export const QUESTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { questions: { type: 'array', items: { type: 'string' } } },
  required: ['questions'],
}

// 質問・候補語は番号(1始まり)で参照させる。文字列 echo を照合キーにすると
// 表記ゆれで EIG 計算・ベイズ更新が silent に外れるため(haiku で実際に発生)。
export const SIM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    grid: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question_index: { type: 'integer', description: '質問の番号(1始まり)' },
          answers: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                word_index: { type: 'integer', description: '候補語の番号(1始まり)' },
                value: { type: 'string', enum: VALUE_ENUM },
              },
              required: ['word_index', 'value'],
            },
          },
        },
        required: ['question_index', 'answers'],
      },
    },
  },
  required: ['grid'],
}

export const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reasoning: { type: 'string', description: 'この性質が単語の定義的特徴か・正体を誤って伝えないかを短く吟味' },
    value: { type: 'string', enum: VALUE_ENUM },
  },
  required: ['reasoning', 'value'],
}

// 推測の正誤判定は「同じ語か否か」の二値。reasoning は観測ログ用。
export const GUESS_VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reasoning: { type: 'string', description: '同一とみなす/みなさない根拠を短く' },
    value: { type: 'string', enum: ['はい', 'いいえ'] },
  },
  required: ['reasoning', 'value'],
}

export const PROFILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    profile: { type: 'string', description: 'この単語の自然な意味と主要な事実的性質を簡潔に(2〜4文)' },
  },
  required: ['profile'],
}

export const LIGHT_MOVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reasoning: { type: 'string', description: 'どう絞り込むかの要点を簡潔に' },
    kind: { type: 'string', enum: ['question', 'guess'] },
    content: { type: 'string', description: 'kind が question なら質問文、guess なら推測する単語' },
  },
  required: ['kind', 'content'],
}
