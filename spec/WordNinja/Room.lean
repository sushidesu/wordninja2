/-!
# ワードニンジャ 部屋進行の形式モデル

ゲームは**お題当て**。各プレイヤーは自分の語を知っており、知らない相手の語を
Yes/No 質問から当てる。サーバーが権威として持つ状態・遷移・可視性の射影を定義し、
壊れてはいけない性質を定理として固定する。実装(TypeScript)とは独立した検証専用のモデル。

設計上の要点:
- チームは「同じ語を持つプレイヤーの集合」として導出する。状態には持たない。
- **できるのは質問だけ**。「当てる」専用の操作は無い。質問がお題そのものだった時、
  語の持ち主が `correct` と答え、そこで質問が終わる。答えを開くのは別の一歩で、
  いきなり開かない。「正解が出た」はフェーズではなく回答の記録から導出する
  (同じ事実を2箇所に持つと、フェーズを戻したときに矛盾が作れてしまう)。
- 質問はラウンドロビン。最初の質問者は配布時に決める(乱択はモデルの外)。
  質問すると手番が次へ進む。回答を待たないのは、回答が任意で待つと詰むため。
- 質問に対象者は無い。**質問者以外の全員が自分の語について答える**(質問者は答えない)。
- 質問と回答は任意。同席プレイでは口頭で進行し、記録が空のまま答え合わせに至る。
- 観戦者は語を持たず、質問も回答もしない。定員にも数えない。
- 部屋を建てた人(最初の参加者)がホスト。配布と部屋設定はホストだけが行う。
  部屋設定はいつでも変えられる(建て直さずに人数やルールを変えるため)。
- 順序制御は最低限。配布を経ていないフェーズへ行けないことだけを縛る。
- 「お題を確認した」は共有の事実なので状態に持つ。ただしフェーズを進めるかは
  規則が決めない(自動遷移を入れると、フェーズと記録が二重の真実になる)。
  全員が確認したら次へ、という判断はクライアントの仕事。
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
    どちらかへ倒すと語の正体を誤って伝えるため。
    `correct` は「質問がお題そのものだった」= ゲームの終了条件。 -/
inductive Answer where
  | yes
  | no
  | partly
  | unknown
  | correct
  deriving DecidableEq, BEq, Repr

structure Question where
  asker : PlayerId
  text : String
  answers : List (PlayerId × Answer)
  deriving Repr

/-- 権威状態。サーバーだけが保持し、ワイヤには乗らない。 -/
structure Room where
  phase : Phase
  players : List PlayerId
  /-- 語を持たず、質問も回答もしない。定員に数えない。 -/
  spectators : List PlayerId
  /-- 最初の参加者。配布と部屋設定を行える唯一の人。未参加なら none。 -/
  host : Option PlayerId
  /-- 次に質問する人。配布前は none。 -/
  turn : Option PlayerId
  teamCount : Nat
  maxPlayers : Nat
  /-- 配布結果。未配布なら空。 -/
  words : List (PlayerId × Word)
  /-- 自分のお題を確認し終えた人。配布のたびに空に戻る。 -/
  confirmed : List PlayerId
  /-- 新しいものが先頭。 -/
  questions : List Question
  deriving Repr

/-- 1プレイヤーに見えるもの。ワイヤに乗るのはこの型だけ。 -/
structure PlayerView where
  phase : Phase
  players : List PlayerId
  spectators : List PlayerId
  host : Option PlayerId
  turn : Option PlayerId
  teamCount : Nat
  maxPlayers : Nat
  confirmed : List PlayerId
  /-- 正解が出たか(導出値)。 -/
  solved : Bool
  /-- 自分の語。観戦者は none。 -/
  myWord : Option Word
  questions : List Question
  /-- 答え合わせのときだけ割当が開く。それ以外は none。 -/
  revealed : Option (List (PlayerId × Word))
  deriving Repr

def emptyRoom : Room :=
  { phase := Phase.lobby, players := [], spectators := [], host := none, turn := none,
    teamCount := 2, maxPlayers := 8, words := [], confirmed := [], questions := [] }

/-- 重複を落とす。語の種類数を数えるために使う。 -/
def nub : List Word → List Word
  | [] => []
  | w :: ws => if ws.contains w then nub ws else w :: nub ws

/-- players を輪と見なして cur の次の人を返す。cur が居なければ先頭。 -/
private def cycleFrom (first : List PlayerId) : List PlayerId → PlayerId → Option PlayerId
  | [], _ => first.head?
  | x :: xs, cur =>
      if x = cur then (match xs with | [] => first.head? | y :: _ => some y)
      else cycleFrom first xs cur

def nextAfter (players : List PlayerId) (cur : PlayerId) : Option PlayerId :=
  cycleFrom players players cur

/-- 配布が健全か: 参加者全員にちょうど1つ語が付き、語の種類がちょうどチーム数。 -/
def ValidDeal (players : List PlayerId) (teamCount : Nat)
    (words : List (PlayerId × Word)) : Prop :=
  words.map Prod.fst = players ∧ (nub (words.map Prod.snd)).length = teamCount

instance (ps : List PlayerId) (n : Nat) (ws : List (PlayerId × Word)) :
    Decidable (ValidDeal ps n ws) := by
  unfold ValidDeal; infer_instance

/-- 正解が出たか。状態には持たず、回答の記録から導出する。 -/
def solved (r : Room) : Bool :=
  r.questions.any (fun q => q.answers.any (fun a => a.2 == Answer.correct))

def myWord (r : Room) (p : PlayerId) : Option Word :=
  (r.words.find? (fun e => e.1 == p)).map Prod.snd

/-- 可視性の射影。権威状態から1プレイヤー分の視点を切り出す唯一の経路。 -/
def viewFor (r : Room) (p : PlayerId) : PlayerView :=
  { phase := r.phase
    players := r.players
    spectators := r.spectators
    host := r.host
    turn := r.turn
    teamCount := r.teamCount
    maxPlayers := r.maxPlayers
    confirmed := r.confirmed
    solved := solved r
    myWord := myWord r p
    questions := r.questions
    revealed := if r.phase = Phase.reveal then some r.words else none }

inductive Action where
  | join (p : PlayerId)
  | spectate (p : PlayerId)
  | leave (p : PlayerId)
  /-- 部屋設定。ホストのみ。いつでも変えられる。 -/
  | configure (by_ : PlayerId) (teamCount : Nat) (maxPlayers : Nat)
  /-- 配布。ホストのみ。配り方も最初の質問者もモデル外(非決定的な入力)。 -/
  | deal (by_ : PlayerId) (words : List (PlayerId × Word)) (firstAsker : PlayerId)
  | goto (ph : Phase)
  /-- 自分のお題を確認した。配布のあと、全員が済んだかを見るために使う。 -/
  | confirm (p : PlayerId)
  /-- 手番の人だけが質問できる。質問すると手番が次へ進む。 -/
  | ask (asker : PlayerId) (text : String)
  /-- 任意。自分の語について答える。質問者は答えない。 -/
  | answer (p : PlayerId) (value : Answer)
  deriving Repr

/-- 遷移。`none` は拒否。 -/
def step (r : Room) : Action → Option Room
  | .join p =>
      -- 最初の参加者がホストになる。定員を超えては入れない。観戦者からの移行も兼ねる。
      if r.phase = Phase.lobby ∧ p ∉ r.players ∧ r.players.length < r.maxPlayers then
        some { r with
          players := r.players ++ [p]
          spectators := r.spectators.filter (fun q => q != p)
          host := if r.host.isNone then some p else r.host }
      else none
  | .spectate p =>
      -- 観戦はいつでも。プレイヤーのまま観戦はできない(語の整合が崩れるため)。
      if p ∉ r.players ∧ p ∉ r.spectators then
        some { r with spectators := r.spectators ++ [p] }
      else none
  | .leave p =>
      -- 抜けた人にホストや手番が取り残されないよう付け替える。
      if p ∈ r.players ∨ p ∈ r.spectators then
        let rest := r.players.filter (fun q => q != p)
        some { r with
          players := rest
          spectators := r.spectators.filter (fun q => q != p)
          host := if r.host = some p then rest.head? else r.host
          turn := if r.turn = some p then
                    (match nextAfter r.players p with
                     | some q => if q = p then none else some q
                     | none => none)
                  else r.turn
          confirmed := r.confirmed.filter (fun q => q != p) }
      else none
  | .configure by_ tc mp =>
      if r.host = some by_ ∧ 2 ≤ tc ∧ tc ≤ 4 ∧ r.players.length ≤ mp then
        some { r with teamCount := tc, maxPlayers := mp }
      else none
  | .deal by_ ws first =>
      if r.phase = Phase.lobby ∧ r.host = some by_ ∧ first ∈ r.players
          ∧ ValidDeal r.players r.teamCount ws then
        some { r with phase := Phase.assignment, words := ws, turn := some first,
                      confirmed := [] }
      else none
  | .goto ph =>
      if ph = Phase.lobby then
        some { r with phase := Phase.lobby, words := [], questions := [], turn := none,
                      confirmed := [] }
      else if r.words ≠ [] then
        some { r with phase := ph }
      else none
  | .confirm p =>
      if r.phase = Phase.assignment ∧ p ∈ r.players ∧ p ∉ r.confirmed then
        some { r with confirmed := r.confirmed ++ [p] }
      else none
  | .ask asker text =>
      -- 手番の人だけ。正解が出たら質問は終わり。
      -- 質問すると手番が次へ進む(回答は任意なので待たない)。
      if r.phase = Phase.playing ∧ r.turn = some asker ∧ solved r = false then
        some { r with
          questions := { asker := asker, text := text, answers := [] } :: r.questions
          turn := nextAfter r.players asker }
      else none
  | .answer p value =>
      match r.phase, r.questions with
      | Phase.playing, q :: qs =>
          -- 質問者以外の全員が答える。観戦者は答えない。
          if p ∈ r.players ∧ p ≠ q.asker ∧ p ∉ q.answers.map Prod.fst then
            -- 正解もただの記録。答えを開くのは別の一歩。
            some { r with questions := { q with answers := (p, value) :: q.answers } :: qs }
          else none
      | _, _ => none

end WordNinja
