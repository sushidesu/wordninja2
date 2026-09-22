import WordNinja.Room

/-!
# 壊れてはいけない性質

ここで証明したものが実装の受け入れ条件になる。
-/

namespace WordNinja

/-- 視点から読み取れる**割当**の語。推測の申告(`Guess.text`)は含めない —
    あれはプレイヤーが公開の場で口にした候補であって、割当の漏洩ではない。 -/
def wordsVisible (v : PlayerView) : List Word :=
  v.myWord.toList ++ (v.revealed.map (fun ws => ws.map Prod.snd)).getD []

/-- **可視性**: 答え合わせ前は、視点に自分の語しか現れない。
    他人の語が1つでも混ざればこの等式が破れる。 -/
theorem visibility_before_reveal (r : Room) (p : PlayerId)
    (h : r.phase ≠ Phase.reveal) :
    wordsVisible (viewFor r p) = (myWord r p).toList := by
  simp [wordsVisible, viewFor, h]

/-- **答え合わせ**: reveal では全員の語が開く。 -/
theorem reveal_opens_all (r : Room) (p : PlayerId) (h : r.phase = Phase.reveal) :
    (viewFor r p).revealed = some r.words := by
  simp [viewFor, h]

/-- **配布の健全性**: 配布が受理されたら、参加者全員にちょうど1つ語が付き、
    語の種類数がチーム数と一致する。 -/
theorem deal_sound {r r' : Room} {ws : List (PlayerId × Word)}
    (h : step r (Action.deal ws) = some r') :
    r'.words.map Prod.fst = r'.players ∧
    (nub (r'.words.map Prod.snd)).length = r'.teamCount := by
  simp only [step] at h
  split at h
  · rename_i hc
    have hr := Option.some.inj h
    subst hr
    obtain ⟨-, hv⟩ := hc
    unfold ValidDeal at hv
    exact ⟨hv.1, hv.2⟩
  · simp at h

/-- **最低限の順序制御**: 配布前は lobby より先へ進めない。 -/
theorem no_advance_before_deal (r : Room) (ph : Phase)
    (hw : r.words = []) (hph : ph ≠ Phase.lobby) :
    step r (Action.goto ph) = none := by
  simp [step, hw, hph]

/-- **推測の対象**: 受理された推測は、必ず自分と違う語の相手に向いている。
    自分の語を当てる申告は成立しない。 -/
theorem guess_targets_other_word {r r' : Room} {g t : PlayerId} {w : Word}
    (h : step r (Action.guess g t w) = some r') :
    myWord r g ≠ myWord r t := by
  simp only [step] at h
  split at h
  · rename_i hc
    exact hc.2.2.2.2.2
  · simp at h

/-- **判定の権限**: 判定が受理されたら、判定者は対象と同じ語の持ち主である。
    他人の推測を第三者が勝手に正解にはできない。 -/
theorem judge_only_by_owner {r r' : Room} {j : PlayerId} {c : Bool}
    (h : step r (Action.judge j c) = some r') :
    ∃ g ∈ r.guesses, myWord r j = myWord r g.target := by
  simp only [step] at h
  split at h
  · split at h
    · rename_i heq hc
      exact ⟨_, by simp_all, hc.2.2⟩
    · simp at h
  · simp at h

/-- **同席プレイの成立**: 質問も推測も記録せずに答え合わせへ到達できる。
    口頭で進行するプレイがサーバーの進行モデルを通る。 -/
theorem verbal_play_reaches_reveal :
    (do
      let r1 ← step emptyRoom (Action.join 1)
      let r2 ← step r1 (Action.join 2)
      let r3 ← step r2 (Action.deal [(1, "サラダ"), (2, "刺身")])
      let r4 ← step r3 (Action.goto Phase.playing)
      step r4 (Action.goto Phase.reveal)).map
        (fun (r : Room) => (r.phase, r.questions.length, r.guesses.length))
      = some (Phase.reveal, 0, 0) := by
  rfl

/-- **1人プレイの成立**: 相手が一度も質問しないまま、質問・回答・推測・判定が回る。
    1人プレイは「相手が質問してこない2人対戦」であり、専用の機構を必要としない
    (questions の asker が人間だけであることが、相手の無言を示す)。 -/
theorem solo_play_needs_no_opponent_questions :
    (do
      let r1 ← step emptyRoom (Action.join 1)   -- 人
      let r2 ← step r1 (Action.join 2)          -- CPU
      let r3 ← step r2 (Action.deal [(1, "サラダ"), (2, "刺身")])
      let r4 ← step r3 (Action.goto Phase.playing)
      let r5 ← step r4 (Action.ask 1 "それは生で食べますか?")
      let r6 ← step r5 (Action.answer 2 Answer.yes)
      let r7 ← step r6 (Action.guess 1 2 "刺身")
      step r7 (Action.judge 2 true)).map
        (fun (r : Room) =>
          (r.questions.map (fun (q : Question) => q.asker),
           r.guesses.map (fun (g : Guess) => g.verdict)))
      = some ([1], [some true]) := by
  rfl

end WordNinja
