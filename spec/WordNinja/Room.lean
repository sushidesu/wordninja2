/-!
# ワードニンジャ 部屋進行の形式モデル

サーバーが権威として持つ部屋の状態・遷移・可視性の射影を定義し、
壊れてはいけない性質を定理として固定する。実装(TypeScript)とは独立した
検証専用のモデルで、ここで証明した性質が実装の受け入れ条件になる。

設計上の要点:
- チームは「同じ語を持つプレイヤーの集合」として導出される。チーム識別子は状態に持たない。
- 質問と回答の記録は任意。同席プレイでは口頭で進行し、記録は空のまま答え合わせに至る。
- 順序制御は最低限。配布を経ていないフェーズへ行けないことだけを縛り、残りは自由に遷移できる。
-/

namespace WordNinja

abbrev PlayerId := Nat
abbrev Word := String

/-- 部屋のフェーズ。 -/
inductive Phase where
  | lobby
  | assignment
  | playing
  | reveal
  deriving DecidableEq, BEq, Repr

/-- 質問と、それに対する各プレイヤーの Yes/No 回答。 -/
structure Question where
  asker : PlayerId
  text : String
  answers : List (PlayerId × Bool)
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
  deriving Repr

/-- 1プレイヤーに見えるもの。ワイヤに乗るのはこの型だけ。 -/
structure PlayerView where
  phase : Phase
  players : List PlayerId
  /-- 自分の語。 -/
  myWord : Option Word
  questions : List Question
  /-- 答え合わせのときだけ全員の語が入る。それ以外は none。 -/
  revealed : Option (List (PlayerId × Word))
  deriving Repr

def emptyRoom : Room :=
  { phase := Phase.lobby, players := [], teamCount := 2, words := [], questions := [] }

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
    revealed := if r.phase = Phase.reveal then some r.words else none }

inductive Action where
  | join (p : PlayerId)
  | leave (p : PlayerId)
  | setTeamCount (n : Nat)
  /-- 配布。ここだけがお題を確定させる。配り方自体はモデル外(非決定的な入力)。 -/
  | deal (words : List (PlayerId × Word))
  /-- 任意のフェーズへ移る。最低限の順序制御はここに集約。 -/
  | goto (ph : Phase)
  | ask (asker : PlayerId) (text : String)
  | answer (p : PlayerId) (yes : Bool)
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
      -- lobby へ戻るときは配布と質問を捨てる。配布前に lobby より先へは行けない。
      if ph = Phase.lobby then
        some { r with phase := Phase.lobby, words := [], questions := [] }
      else if r.words ≠ [] then
        some { r with phase := ph }
      else none
  | .ask asker text =>
      if r.phase = Phase.playing ∧ asker ∈ r.players then
        some { r with questions := { asker := asker, text := text, answers := [] } :: r.questions }
      else none
  | .answer p yes =>
      match r.phase, r.questions with
      | Phase.playing, q :: qs =>
          if p ∈ r.players ∧ p ∉ q.answers.map Prod.fst then
            some { r with questions := { q with answers := (p, yes) :: q.answers } :: qs }
          else none
      | _, _ => none

end WordNinja
