import WordNinja.Room

/-!
# 壊れてはいけない性質

ここで証明したものが実装の受け入れ条件になる。
-/

namespace WordNinja

/-- 視点から読み取れる語の全体。射影が漏れていないかを測るための観測。 -/
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

/-- **同席プレイの成立**: 質問を一度も記録せずに答え合わせへ到達できる。
    口頭で進行するプレイがサーバーの進行モデルを通ることの確認。 -/
theorem verbal_play_reaches_reveal :
    (do
      let r1 ← step emptyRoom (Action.join 1)
      let r2 ← step r1 (Action.join 2)
      let r3 ← step r2 (Action.deal [(1, "サラダ"), (2, "刺身")])
      let r4 ← step r3 (Action.goto Phase.playing)
      step r4 (Action.goto Phase.reveal)).map
        (fun (r : Room) => (r.phase, r.questions.length)) = some (Phase.reveal, 0) := by
  rfl

end WordNinja
