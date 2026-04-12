-- Words
INSERT INTO words (id, text) VALUES
  ('w01', 'おにぎり'),
  ('w02', 'サンドイッチ'),
  ('w03', '犬'),
  ('w04', '猫'),
  ('w05', '海'),
  ('w06', '山'),
  ('w07', 'コーヒー'),
  ('w08', '紅茶'),
  ('w09', '夏'),
  ('w10', '冬'),
  ('w11', '映画'),
  ('w12', '小説'),
  ('w13', '遊園地'),
  ('w14', '水族館'),
  ('w15', 'カレー'),
  ('w16', 'ラーメン'),
  ('w17', 'ピアノ'),
  ('w18', 'ギター'),
  ('w19', 'サッカー'),
  ('w20', '野球'),
  ('w21', '温泉'),
  ('w22', 'サウナ'),
  ('w23', '岩盤浴'),
  ('w24', '春'),
  ('w25', '秋'),
  ('w26', 'うどん'),
  ('w27', 'そば'),
  ('w28', 'パスタ'),
  ('w29', '動物園'),
  ('w30', '博物館'),
  ('w31', 'バスケ'),
  ('w32', 'テニス'),
  ('w33', 'バイオリン'),
  ('w34', 'ドラム'),
  ('w35', '川'),
  ('w36', '湖');

-- TopicSets
INSERT INTO topic_sets (id) VALUES
  ('ts01'), ('ts02'), ('ts03'), ('ts04'), ('ts05'),
  ('ts06'), ('ts07'), ('ts08'), ('ts09'), ('ts10'),
  ('ts11'), ('ts12'), ('ts13'), ('ts14');

-- TopicSet - Word associations
-- ts01: おにぎり, サンドイッチ
INSERT INTO topic_set_words (topic_set_id, word_id) VALUES ('ts01', 'w01'), ('ts01', 'w02');
-- ts02: 犬, 猫
INSERT INTO topic_set_words (topic_set_id, word_id) VALUES ('ts02', 'w03'), ('ts02', 'w04');
-- ts03: 海, 山, 川, 湖
INSERT INTO topic_set_words (topic_set_id, word_id) VALUES ('ts03', 'w05'), ('ts03', 'w06'), ('ts03', 'w35'), ('ts03', 'w36');
-- ts04: コーヒー, 紅茶
INSERT INTO topic_set_words (topic_set_id, word_id) VALUES ('ts04', 'w07'), ('ts04', 'w08');
-- ts05: 夏, 冬, 春, 秋
INSERT INTO topic_set_words (topic_set_id, word_id) VALUES ('ts05', 'w09'), ('ts05', 'w10'), ('ts05', 'w24'), ('ts05', 'w25');
-- ts06: 映画, 小説
INSERT INTO topic_set_words (topic_set_id, word_id) VALUES ('ts06', 'w11'), ('ts06', 'w12');
-- ts07: 遊園地, 水族館, 動物園, 博物館
INSERT INTO topic_set_words (topic_set_id, word_id) VALUES ('ts07', 'w13'), ('ts07', 'w14'), ('ts07', 'w29'), ('ts07', 'w30');
-- ts08: カレー, ラーメン
INSERT INTO topic_set_words (topic_set_id, word_id) VALUES ('ts08', 'w15'), ('ts08', 'w16');
-- ts09: ピアノ, ギター, バイオリン, ドラム
INSERT INTO topic_set_words (topic_set_id, word_id) VALUES ('ts09', 'w17'), ('ts09', 'w18'), ('ts09', 'w33'), ('ts09', 'w34');
-- ts10: サッカー, 野球, バスケ, テニス
INSERT INTO topic_set_words (topic_set_id, word_id) VALUES ('ts10', 'w19'), ('ts10', 'w20'), ('ts10', 'w31'), ('ts10', 'w32');
-- ts11: 温泉, サウナ, 岩盤浴
INSERT INTO topic_set_words (topic_set_id, word_id) VALUES ('ts11', 'w21'), ('ts11', 'w22'), ('ts11', 'w23');
-- ts12: うどん, そば, パスタ, ラーメン
INSERT INTO topic_set_words (topic_set_id, word_id) VALUES ('ts12', 'w26'), ('ts12', 'w27'), ('ts12', 'w28'), ('ts12', 'w16');
-- ts13: おにぎり, カレー, ラーメン, うどん
INSERT INTO topic_set_words (topic_set_id, word_id) VALUES ('ts13', 'w01'), ('ts13', 'w15'), ('ts13', 'w16'), ('ts13', 'w26');
-- ts14: 犬, 猫, 海, 山
INSERT INTO topic_set_words (topic_set_id, word_id) VALUES ('ts14', 'w03'), ('ts14', 'w04'), ('ts14', 'w05'), ('ts14', 'w06');
