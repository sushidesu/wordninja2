import WordNinja.Room

/-!
# 壊れてはいけない性質

ここで証明したものが実装の受け入れ条件になる。
-/

namespace WordNinja

/-- 視点から読み取れる割当の語。 -/
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
theorem deal_sound {r r' : Room} {by_ first : PlayerId} {ws : List (PlayerId × Word)}
    (h : step r (Action.deal by_ ws first) = some r') :
    r'.words.map Prod.fst = r'.players ∧
    (nub (r'.words.map Prod.snd)).length = r'.teamCount := by
  simp only [step] at h
  split at h
  · rename_i hc
    have hr := Option.some.inj h
    subst hr
    obtain ⟨-, -, -, hv⟩ := hc
    unfold ValidDeal at hv
    exact ⟨hv.1, hv.2⟩
  · simp at h

/-- **配布の権限**: 配布できるのはホストだけ。 -/
theorem deal_only_by_host {r r' : Room} {by_ first : PlayerId} {ws : List (PlayerId × Word)}
    (h : step r (Action.deal by_ ws first) = some r') : r.host = some by_ := by
  simp only [step] at h
  split at h
  · rename_i hc; exact hc.2.1
  · simp at h

/-- **設定の権限**: 部屋設定を変えられるのはホストだけ。 -/
theorem configure_only_by_host {r r' : Room} {by_ : PlayerId} {tc mp : Nat}
    (h : step r (Action.configure by_ tc mp) = some r') : r.host = some by_ := by
  simp only [step] at h
  split at h
  · rename_i hc; exact hc.1
  · simp at h

/-- **ホストの決定**: 誰もいない部屋に最初に入った人がホストになる。 -/
theorem first_join_becomes_host {r r' : Room} {p : PlayerId}
    (hh : r.host = none) (h : step r (Action.join p) = some r') :
    r'.host = some p := by
  simp only [step] at h
  split at h
  · have hr := Option.some.inj h
    subst hr
    simp [hh]
  · simp at h

/-- **定員**: 受理された参加の時点で、定員に空きがあった。 -/
theorem join_respects_capacity {r r' : Room} {p : PlayerId}
    (h : step r (Action.join p) = some r') : r.players.length < r.maxPlayers := by
  simp only [step] at h
  split at h
  · rename_i hc; exact hc.2.2
  · simp at h

/-- **手番**: 質問が受理されたら、その人が手番だった。順番を飛ばして質問できない。 -/
theorem ask_follows_turn {r r' : Room} {p : PlayerId} {t : String}
    (h : step r (Action.ask p t) = some r') : r.turn = some p := by
  simp only [step] at h
  split at h
  · rename_i hc; exact hc.2.1
  · simp at h

/-- **観戦者**: 観戦はプレイヤーでない人だけ。 -/
theorem spectate_requires_not_player {r r' : Room} {p : PlayerId}
    (h : step r (Action.spectate p) = some r') : p ∉ r.players := by
  simp only [step] at h
  split at h
  · rename_i hc; exact hc.1
  · simp at h

/-- **観戦者からの参加**: 参加すると観戦者からは外れる(二重在籍しない)。 -/
theorem join_leaves_spectators {r r' : Room} {p : PlayerId}
    (h : step r (Action.join p) = some r') : p ∉ r'.spectators := by
  simp only [step] at h
  split at h
  · have hr := Option.some.inj h
    subst hr
    simp
  · simp at h

/-- **質問者は答えない**: 受理された回答は、必ずその質問をした本人以外のもの。 -/
theorem asker_never_answers {r r' : Room} {p : PlayerId} {v : Answer}
    (h : step r (Action.answer p v) = some r') :
    ∃ q ∈ r.questions, p ≠ q.asker := by
  simp only [step] at h
  split at h
  · split at h
    · rename_i heq hc
      exact ⟨_, by simp_all, hc.2.1⟩
    · simp at h
  · simp at h

/-- **ワンクッション**: 回答はフェーズを動かさない。正解が出ても答えは開かず、
    答え合わせへ移るのは別の一歩。 -/
theorem answer_never_changes_phase {r r' : Room} {p : PlayerId} {v : Answer}
    (h : step r (Action.answer p v) = some r') : r'.phase = r.phase := by
  simp only [step] at h
  split at h
  · split at h
    · have hr := Option.some.inj h; subst hr; simp
    · simp at h
  · simp at h

/-- **正解のあとは質問できない**: 正解が記録されていれば質問は受理されない。 -/
theorem no_ask_when_solved {r : Room} {p : PlayerId} {t : String}
    (hs : solved r = true) : step r (Action.ask p t) = none := by
  simp [step, hs]

/-- **確認**: 確認できるのは配布直後(assignment)のプレイヤーだけ。 -/
theorem confirm_requires_assignment {r r' : Room} {p : PlayerId}
    (h : step r (Action.confirm p) = some r') :
    r.phase = Phase.assignment ∧ p ∈ r.players := by
  simp only [step] at h
  split at h
  · rename_i hc; exact ⟨hc.1, hc.2.1⟩
  · simp at h

/-- **確認はフェーズを動かさない**: 全員が確認しても規則は勝手に進めない。
    進めるかどうかはクライアントが決める。 -/
theorem confirm_never_changes_phase {r r' : Room} {p : PlayerId}
    (h : step r (Action.confirm p) = some r') : r'.phase = r.phase := by
  simp only [step] at h
  split at h
  · have hr := Option.some.inj h; subst hr; simp
  · simp at h

/-- **配り直し**: 配布すると確認は白紙に戻る。 -/
theorem deal_clears_confirmations {r r' : Room} {by_ first : PlayerId}
    {ws : List (PlayerId × Word)}
    (h : step r (Action.deal by_ ws first) = some r') : r'.confirmed = [] := by
  simp only [step] at h
  split at h
  · have hr := Option.some.inj h; subst hr; simp
  · simp at h

/-- **離脱**: 抜けた人にホストは残らない。 -/
theorem leave_transfers_host {r r' : Room} {p : PlayerId}
    (h : step r (Action.leave p) = some r') : r'.host ≠ some p := by
  simp only [step] at h
  split at h
  · have hr := Option.some.inj h
    subst hr
    by_cases hc : r.host = some p
    · simp only [hc]
      intro hh
      have : p ∈ r.players.filter (fun q => q != p) := List.mem_of_mem_head? hh
      simp [List.mem_filter] at this
    · simpa [hc] using hc
  · simp at h

/-- **離脱**: 抜けた人に手番は残らない。 -/
theorem leave_moves_turn {r r' : Room} {p : PlayerId}
    (h : step r (Action.leave p) = some r') : r'.turn ≠ some p := by
  simp only [step] at h
  split at h
  · have hr := Option.some.inj h
    subst hr
    by_cases hc : r.turn = some p
    · simp only [hc]
      cases hn : nextAfter r.players p with
      | none => simp
      | some q => by_cases hq : q = p <;> simp [hq]
    · simpa [hc] using hc
  · simp at h

/-- **同席プレイの成立**: 質問を記録せずに答え合わせへ到達できる。
    口頭で進行するプレイがサーバーの進行モデルを通る。 -/
theorem verbal_play_reaches_reveal :
    (do
      let r1 ← step emptyRoom (Action.join 1)
      let r2 ← step r1 (Action.join 2)
      let r3 ← step r2 (Action.deal 1 [(1, "サラダ"), (2, "刺身")] 1)
      let r4 ← step r3 (Action.goto Phase.playing)
      step r4 (Action.goto Phase.reveal)).map
        (fun (r : Room) => (r.phase, r.questions.length))
      = some (Phase.reveal, 0) := by
  rfl

/-- **1人プレイの成立**: 相手が一度も質問しないまま、質問と回答が回る。
    1人プレイは「相手が質問してこない2人対戦」であり、専用の機構を必要としない。 -/
theorem solo_play_needs_no_opponent_questions :
    (do
      let r1 ← step emptyRoom (Action.join 1)   -- 人(ホスト)
      let r2 ← step r1 (Action.join 2)          -- CPU
      let r3 ← step r2 (Action.deal 1 [(1, "サラダ"), (2, "刺身")] 1)
      let r4 ← step r3 (Action.goto Phase.playing)
      let r5 ← step r4 (Action.ask 1 "それは生で食べますか?")
      step r5 (Action.answer 2 Answer.yes)).map
        (fun (r : Room) =>
          (r.questions.map (fun (q : Question) => q.asker),
           r.questions.map (fun (q : Question) => q.answers.length)))
      = some ([1], [1]) := by
  rfl

end WordNinja
