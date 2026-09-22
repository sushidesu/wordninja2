/-!
# ワードニンジャ 部屋進行の形式モデル

ゲームは**お題当て**。各プレイヤーは自分の語を知っており、知らない相手の語を
Yes/No 質問から当てる。サーバーが権威として持つ状態・遷移・可視性の射影を定義し、
壊れてはいけない性質を定理として固定する。実装(TypeScript)とは独立した検証専用のモデル。

設計上の要点:
- チームは「同じ語を持つプレイヤーの集合」として導出する。主役の概念ではないので状態に持たない。
- 質問・回答・推測は**すべて任意**。同席プレイでは口頭で進行し、記録が空のまま答え合わせに至る。
  1人プレイは「相手が質問してこない2人対戦」であり、専用の機構を持たない。
- 推測の正誤は**語の持ち主が判定する**。サーバーは判定しない(LLM に依存しない)。
- 順序制御は最低限。配布を経ていないフェーズへ行けないことだけを縛る。
-/

namespace WordNinja

abbrev PlayerId := Nat
abbrev Word := String

inductive Phase where
  | lobby
  | assignment
  | playing
  | reveal
  deriving DecidableEq, BEq, Repr

/-- 回答。2値に潰さないのは、対象が本質的に複数の顔を持つ場合に
    どちらかへ倒すと語の正体を誤って伝えるため(oracle の実測由来)。 -/
inductive Answer where
  | yes
  | no
  | partly
  | unknown
  deriving DecidableEq, BEq, Repr

/-- 質問と、各プレイヤーが自分の語について返した回答。 -/
structure Question where
  asker : PlayerId
  text : String
  answers : List (PlayerId × Answer)
  deriving Repr

/-- 推測。`target` の語を当てようとする申告で、正誤は持ち主が判定する。 -/
structure Guess where
  guesser : PlayerId
  target : PlayerId
  text : Word
  /-- 未判定は none。 -/
  verdict : Option Bool
  deriving Repr

/-- 権威状態。サーバーだけが保持し、ワイヤには乗らない。 -/
structure Room where
  phase : Phase
  players : List PlayerId
  teamCount : Nat
  /-- 配布結果。未配布なら空。 -/
  words : List (PlayerId × Word)
  /-- 新しいものが先頭。 -/
  questions : List Question
  /-- 新しいものが先頭。 -/
  guesses : List Guess
  deriving Repr

/-- 1プレイヤーに見えるもの。ワイヤに乗るのはこの型だけ。 -/
structure PlayerView where
  phase : Phase
  players : List PlayerId
  /-- 自分の語。 -/
  myWord : Option Word
  questions : List Question
  /-- 推測は公開の発言なので全員に見える。中の語は申告であって割当ではない。 -/
  guesses : List Guess
  /-- 答え合わせのときだけ割当が開く。それ以外は none。 -/
  revealed : Option (List (PlayerId × Word))
  deriving Repr

def emptyRoom : Room :=
  { phase := Phase.lobby, players := [], teamCount := 2,
    words := [], questions := [], guesses := [] }

/-- 重複を落とす。語の種類数を数えるために使う。 -/
def nub : List Word → List Word
  | [] => []
  | w :: ws => if ws.contains w then nub ws else w :: nub ws

/-- 配布が健全か: 参加者全員にちょうど1つ語が付き、語の種類がちょうどチーム数。 -/
def ValidDeal (players : List PlayerId) (teamCount : Nat)
    (words : List (PlayerId × Word)) : Prop :=
  words.map Prod.fst = players ∧ (nub (words.map Prod.snd)).length = teamCount

instance (ps : List PlayerId) (n : Nat) (ws : List (PlayerId × Word)) :
    Decidable (ValidDeal ps n ws) := by
  unfold ValidDeal; infer_instance

def myWord (r : Room) (p : PlayerId) : Option Word :=
  (r.words.find? (fun e => e.1 == p)).map Prod.snd

/-- 可視性の射影。権威状態から1プレイヤー分の視点を切り出す唯一の経路。 -/
def viewFor (r : Room) (p : PlayerId) : PlayerView :=
  { phase := r.phase
    players := r.players
    myWord := myWord r p
    questions := r.questions
    guesses := r.guesses
    revealed := if r.phase = Phase.reveal then some r.words else none }

inductive Action where
  | join (p : PlayerId)
  | leave (p : PlayerId)
  | setTeamCount (n : Nat)
  /-- 配布。ここだけがお題を確定させる。配り方自体はモデル外(非決定的な入力)。 -/
  | deal (words : List (PlayerId × Word))
  /-- 任意のフェーズへ移る。最低限の順序制御はここに集約。 -/
  | goto (ph : Phase)
  /-- 任意。同席プレイでは使われない。 -/
  | ask (asker : PlayerId) (text : String)
  /-- 任意。自分の語について答える。 -/
  | answer (p : PlayerId) (value : Answer)
  /-- 任意。target の語を当てる申告。 -/
  | guess (guesser : PlayerId) (target : PlayerId) (text : Word)
  /-- 最新の未判定の推測を、語の持ち主が判定する。 -/
  | judge (judger : PlayerId) (correct : Bool)
  deriving Repr

/-- 遷移。`none` は拒否。 -/
def step (r : Room) : Action → Option Room
  | .join p =>
      if r.phase = Phase.lobby ∧ p ∉ r.players then
        some { r with players := r.players ++ [p] }
      else none
  | .leave p =>
      if p ∈ r.players then
        some { r with players := r.players.filter (fun q => q != p) }
      else none
  | .setTeamCount n =>
      if r.phase = Phase.lobby ∧ 2 ≤ n ∧ n ≤ 4 then
        some { r with teamCount := n }
      else none
  | .deal ws =>
      if r.phase = Phase.lobby ∧ ValidDeal r.players r.teamCount ws then
        some { r with phase := Phase.assignment, words := ws }
      else none
  | .goto ph =>
      -- lobby へ戻るときは記録を捨てる。配布前に lobby より先へは行けない。
      if ph = Phase.lobby then
        some { r with phase := Phase.lobby, words := [], questions := [], guesses := [] }
      else if r.words ≠ [] then
        some { r with phase := ph }
      else none
  | .ask asker text =>
      if r.phase = Phase.playing ∧ asker ∈ r.players then
        some { r with questions :=
          { asker := asker, text := text, answers := [] } :: r.questions }
      else none
  | .answer p value =>
      match r.phase, r.questions with
      | Phase.playing, q :: qs =>
          if p ∈ r.players ∧ p ∉ q.answers.map Prod.fst then
            some { r with questions := { q with answers := (p, value) :: q.answers } :: qs }
          else none
      | _, _ => none
  | .guess guesser target text =>
      -- 自分と同じ語の相手には推測しない(当てる対象が自分の語になってしまう)。
      if r.phase = Phase.playing ∧ guesser ∈ r.players ∧ target ∈ r.players
          ∧ (myWord r guesser).isSome = true ∧ (myWord r target).isSome = true
          ∧ myWord r guesser ≠ myWord r target then
        some { r with guesses :=
          { guesser := guesser, target := target, text := text, verdict := none } :: r.guesses }
      else none
  | .judge judger correct =>
      match r.phase, r.guesses with
      | Phase.playing, g :: gs =>
          -- 判定できるのは語の持ち主だけ。
          if g.verdict = none ∧ (myWord r judger).isSome = true
              ∧ myWord r judger = myWord r g.target then
            some { r with guesses := { g with verdict := some correct } :: gs }
          else none
      | _, _ => none

end WordNinja
