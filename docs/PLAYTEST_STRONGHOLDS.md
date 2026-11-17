# Playtest - Strongholds (bản mở rộng), 2026-11-17

## Cách chơi
- Script `packages/engine/fuzz/playtest.ts` (chạy: `node ../../node_modules/tsx/dist/cli.mjs fuzz/playtest.ts <seed> <maxTurns> <vpToWin> <out.log>`).
- p1 = "người chơi bình thường" (ưu tiên: thẻ, city/settlement, improve cấp thấp nhất, rampart, activate/recruit/promote, road, đổi bank/người chơi, di chuyển warden, chase, displace, bazaar...), p2-p4 = bot `hard`, 4 người, base+strongholds.
- 3 ván: seed pt1/pt2/pt3. Ván 13 VP (pt1) kết thúc ở turn 172 = round 43, p2 thắng. Ba ván 99 VP chạy đủ 200 turn = 50 round (log đầy đủ trong scratchpad).
- Giới hạn: đây là chơi qua engine (không qua giao diện web), nên chưa đánh giá UX/UI. Chiến thuật của p1 khá đơn giản (không đàm phán thật), nên các nhận xét về cân bằng chỉ là tín hiệu, chưa phải kết luận.
- Tham chiếu: 30 ván 4 bot `hard` expansion kết thúc trung bình ~102 turn (~25 round), 0 hành động bất hợp lệ.

## Điểm bất hợp lý / cần sửa
Mức: **B** = lỗi/bất nhất rõ, **C** = cân bằng, **G** = bot, **?** = cần PO quyết.

| # | Mức | Phát hiện | Bằng chứng | Gợi ý |
|---|---|---|---|---|
| 1 | B | **Bazaar chơi được dù không ai có commodity**: `check: ok` (cards.ts:196) và `sh:bazaarOffer` vẫn hợp lệ với người không có commodity -> đề nghị "thất bại" im lặng, thẻ bị mất. Trái S8 ("thẻ không có mục tiêu thì không chơi được"). Đầu game commodity rất hiếm nên thẻ gần như luôn lãng phí. | pt1 turn 18 (p4 offer 3 người, 0 `bazaarGive`), turn 111 (p1 offer 3 người, 0 phản hồi) | `check`: cần >=1 người khác có commodity; `legal`: chỉ liệt kê mục tiêu có commodity; UI hiện số commodity của đối thủ. |
| 2 | B | **Trả lời trade có thể đổi ý vô hạn**: người nhận gọi `respondTrade` accept/reject xen kẽ không giới hạn (harness lặp 5982 lần). Không có trạng thái "đã trả lời", dễ gây vòng lặp client/bot và spam log. | lần chạy đầu của playtest | Khoá câu trả lời (hoặc chỉ cho đổi 1 lần), `legal` không liệt kê lại câu đã chọn. |
| 3 | C | **Thương đoàn (caravan) đá qua đá lại**: 6/18 thẻ commerce là caravan nhưng chỉ có 1 quân; mỗi lần chơi thẻ = +1 VP cho mình, -1 cho người đang giữ, không tốn gì thêm. p1/p3/p4 giành lại nhau 8+ lần trong 1 ván; p1 VP 5->4->5->3 chỉ vì caravan và đường dài. | pt1 turn 86-87, 123-127, 146-170 | Giảm số thẻ caravan (vd 3), hoặc không được chơi caravan khi đang giữ/ chỉ lấy lại sau 1 vòng, hoặc đền 1 resource. ? |
| 4 | C | **Shield (1 VP) leo thang cho người dẫn đầu**: người có nhiều warden mạnh nhất nhận shield ở MỖI đợt tấn công, không giới hạn (S6). Ván 99 VP: 1 người có 5 shield = 5 VP chỉ từ phòng thủ (pt1 p2, pt2 p4, pt3 p3). Cộng thêm đường dài 2 VP, caravan 1 VP, thắng 13 VP chủ yếu nhờ phòng thủ + cắt đường. | FINAL trong log | Giới hạn shield (vd 3) hoặc shield chuyển dần (người mới vượt thì lấy shield của người cũ). ? |
| 5 | C | **Không có cơ chế bắt kịp sau khi bị pillage**: raid đầu tiên (round 3) làm p3,p4 mất city 3->2 VP, và họ ở 2 VP suốt turn 10-93 (20+ round) vì không dựng lại city. Vòng xoáy: ít city -> ít commodity -> không lên level -> không thẻ/capital. | pt1 turn 9-93 | Cần quyết định PO: hỗ trợ người thua (vd người bị pillage được 1 resource/ giảm giá city lần đầu). Phần nào là lỗi bot (xem 7). |
| 6 | C | **Level/capital hầu như không dùng được trong ván thật**: ván 13 VP, sau 43 round level cao nhất là 3, không capital nào được lập, 0 lần dùng perk level 3 của learning/council. Ván 99 VP mới thấy level 4-5 sau ~150 turn. Chi phí cải tiến L commodity/cấp + commodity chỉ ra từ city trên forest/meadow/quarry quá chậm so với tốc độ thắng 13 VP. | pt1 (13 VP) vs pt2/pt3 (99 VP) | Giữ chi phí đã xác minh (S1) nhưng xem lại: thắng 13 VP quá sớm so với đường cải tiến, hoặc thêm nguồn commodity. ? |
| 7 | G | **Bot ưu tiên warden hơn kinh tế**: p3 giữ 2 VP trong 80 turn trong khi liên tục recruit/activate/promote; bot gần như không bao giờ chấp nhận đổi 1:1 của người; bot lặp `sh:play bazaar`/`corner` kém hiệu quả. | pt1 turn 9-93 | Bước 5 của M4 (bot strongholds-aware): cân nhắc city/improve vs warden, định giá raid. |
| 8 | G/UX | **Quá nhiều hành động hợp lệ vô nghĩa**: `sh:moveWarden` (135 lần được liệt kê), `offerTrade` (4270 lần liệt kê). Di chuyển warden không tốn gì và không có lợi trừ khi để chiếm điểm. | thống kê "offered" | UI cần nhóm/ẩn hành động; không phải lỗi engine. |
| 9 | ? | **Raid đầu quá sớm có thể xảy ra** (turn 9 = round 3, chỉ 7 lần quân địch di chuyển trong 9 lượt) khi chưa ai kịp có warden hoạt động -> người không có warden bị mất city ngay. Phân phối bình thường ~14 turn nhưng không có "thời gian miễn" đầu game. | pt1 | Cân nhắc raid không kích hoạt trước round 3-4 hoặc cho 1 warden miễn phí khi setup. ? |

## Không thấy lỗi
Không có hành động bất hợp lệ từ bot, không có state kẹt (STALL), pending choice (pickDeck, relocate, titheTake, sabotageDiscard, bazaarGive) luôn giải quyết được, win ngay khi rút thẻ VP lúc roll ở lượt của mình (turn 172) hoạt động đúng S10.

## Chưa kiểm
- Toàn bộ giao diện web (2D/3D): hiển thị raid, chọn mục tiêu, pending choice, thông báo trade.
- 5-6 người (paired turn) không nằm trong playtest này.

---

# Playtest qua giao diện (2026-11-17)

Script: `packages/e2e/ui-play/play.mts` (Playwright + Edge, client dev 5173, 1 người + 3 bot `hard`, expansion). Chạy: `node ../../node_modules/tsx/dist/cli.mjs ui-play/play.mts <seed> <maxRounds> <outDir>`.
Kết quả: 3 ván đến hết game: **ui-1 kết thúc round 23 (Bot 3 thắng 13 VP)**, **ui-2 kết thúc round 25 (Bot 2 thắng)**; người chơi chỉ đạt 2-4 VP. Không có lỗi console/pageerror, không có trạng thái kẹt, mọi pending (cướp, bỏ bài, chọn nhánh, thẻ pavers/armory/mason/toll/bazaar/irrigate/scaffold) thao tác được bằng chuột. Ảnh và log: `packages/e2e/ui-play/run*` (chỉ ở máy, không commit).
Giới hạn: người chơi do script điều khiển (ưu tiên cải tiến/xây/vệ binh, không đàm phán, đổi ngân hàng chỉ thử 1 lần), nên điểm số của người không phản ánh người thật; ván không bao giờ chạm 50 round vì bot thắng trước (~25 round).

## Điểm bất hợp lý ở giao diện
| # | Mức | Phát hiện |
|---|---|---|
| U1 | B | Bản mở rộng vẫn hiện **"Mua thẻ"**, dòng **"Thẻ"** trong bảng Chi phí và vùng **"Thẻ phát triển"** (rules: bộ thẻ cơ bản không dùng). |
| U2 | B | **Thẻ tiến bộ hiện 2 nơi, 2 tên**: "Thẻ phát triển" (thanh dưới) và "Thẻ tiến bộ n/4" (panel phải). |
| U3 | B | Nhắc đặt quân thứ 2 trong setup ghi "đặt một **ngôi làng**" nhưng nhật ký ghi quân này là **thành phố** (miễn phí). Cần kiểm lại chữ. |
| U4 | B | Hộp thoại **"Đổi bài" tự mở trống** (chỉ có "Chỉ người đang tới lượt mới mở được...") khi đề nghị của bot biến mất, không tự đóng (ván ui-1 r4, ui-2 r8). |
| U5 | C | Sau khi chọn mục tiêu cho hành động mở rộng (recruit, promote, toll...), thanh trạng thái vẫn ghi "Lượt của bạn: xây dựng, đổi bài hoặc kết thúc lượt" thay vì nhắc cần chọn gì (chỉ có `sh-pickbar`; cần xác nhận bằng mắt). |
| U6 | C | Hộp "Cướp của ai?" vẫn hiện khi chỉ có **1 mục tiêu** (S4 nói lựa chọn duy nhất tự giải quyết). |
| U7 | C | Từ chối đề nghị của bot vẫn **đổi ý được liên tục** ("Bạn vẫn có thể đổi ý...") - cùng lỗi B2 ở engine. |
| U8 | C | Hộp đề nghị đổi bài **che giữa bàn cờ**; panel phải bị cắt ở 900px, phải cuộn mới thấy nút vệ binh. |
| U9 | C | Người chơi có thể bị kẹt 14 bài (Gỗ 10) mà không có gợi ý nào; bot thì không (do script ngừng thử đổi ngân hàng sau lần đầu nên đây là lỗi script, không phải app). |

## Đã sửa (2026-11-17)
- B1 bazaar: thẻ chỉ chơi được khi mình có resource và có người khác giữ commodity; đề nghị tới người không có commodity bị từ chối (`NO_COMMODITY`), không còn trong legal (cards.ts, S8 cập nhật).
- B2 trade: mỗi người trả lời tối đa 5 lần cho một đề nghị (`ANSWER_LIMIT`, `MAX_TRADE_ANSWERS` trong base/trade.ts; D20, RULES.md cập nhật). Test mới trong official-rules và strongholds.
- U1/U2: bản mở rộng không còn nút "Mua thẻ", dòng "Thẻ" trong bảng Chi phí và dải "Thẻ phát triển" (thẻ tiến bộ chỉ ở panel Thành trì).
- U3: setup ghi "đặt một thành phố" / "cạnh thành phố vừa đặt" cho quân thứ 2 ở bản mở rộng.
- U4: hộp Đổi bài tự đóng khi không phải lượt mình và không còn đề nghị nào.
- U5: cướp khi chỉ có 1 người để cướp thì tự thực hiện, không hỏi.
- U6: khi đang chọn mục tiêu cho hành động mở rộng, thanh trạng thái hiện lời nhắc của bước chọn.
- U7: hộp trả lời đề nghị của người khác nằm cạnh bàn cờ (không nền tối, bàn cờ vẫn bấm được).
- U8: panel Thành trì gọn hơn; ở 1440x900 thấy đủ nút vệ binh và thẻ tiến bộ (phần giặc biển ở trên phải cuộn lên).
