# Gameplay: các luồng, trạng thái và hành động của người chơi

Ảnh chụp từ app thật (client dev, 1440×900, giao diện tiếng Việt, luật cơ bản 4 người).
Các thế cờ lấy từ một ván 4 bot "Khó" tự chơi hết (seed `gameplay-tour-1`, 462 nước, 65 lượt), nạp vào app qua ô
"Nạp ván từ log" đúng thời điểm của từng trạng thái; sau đó bấm trên UI như người chơi thật.
Phần I là một ván thật: 1 người chơi + 3 bot.

Chụp lại: bật client (port 5173) và server (port 8080), rồi trong `packages/e2e`:

```bash
node ../../node_modules/tsx/dist/cli.mjs tools/gen-gameplay-log.mts gameplay-tour-1 > ui-play/gameplay/log.json
node ../../node_modules/tsx/dist/cli.mjs ui-play/gameplay-tour.mts
```

## A. Bắt đầu ván

### 01. Màn hình chính
Chọn số người, bản mở rộng, hạt giống (seed), từng ghế là người hay bot; khung "Chơi trực tuyến" và "Nạp ván từ log".

![Màn hình chính](01-home.png)

### 02. Thiết lập ghế
4 người, ghế 2 là bot; có thể đặt tên từng người chơi.

![Thiết lập ghế](02-home-seats.png)

### 03. Màn che "Chuyền máy"
Chơi chung một máy: trước mỗi lần đổi người, bài trên tay được che lại cho tới khi người kế tiếp bấm "Tôi đã sẵn sàng".

![Màn che "Chuyền máy"](03-pass-device-cover.png)

### 04. Giai đoạn đặt nhà: chọn chỗ đặt làng đầu tiên
Các giao điểm hợp lệ được tô sáng; dòng trạng thái nói phải làm gì.

![Giai đoạn đặt nhà: chọn chỗ đặt làng đầu tiên](04-setup-settlement.png)

### 05. Đặt con đường đi kèm làng
Sau khi đặt làng, chỉ các cạnh nối với làng vừa đặt được tô sáng.

![Đặt con đường đi kèm làng](05-setup-road.png)

### 06. Chuyển sang người kế tiếp
Đặt xong làng + đường thì lượt đặt chuyển cho người tiếp theo (màn che xuất hiện).

![Chuyển sang người kế tiếp](06-setup-next-player-cover.png)

### 07. Vòng đặt thứ hai (đi ngược chiều)
Người đặt cuối vòng 1 đặt tiếp làng thứ hai; làng thứ hai sẽ nhận tài nguyên từ các ô xung quanh.

![Vòng đặt thứ hai (đi ngược chiều)](07-setup-round2.png)

### 08. Lượt đầu tiên: chờ gieo xúc xắc
Hết giai đoạn đặt nhà. Tay bài có tài nguyên từ làng thứ hai; chỉ nút "Gieo xúc xắc" sáng.

![Lượt đầu tiên: chờ gieo xúc xắc](08-first-turn-preroll.png)

### 09. Nút bị khóa có giải thích
Rê chuột lên nút đang khóa để xem lý do (ví dụ phải gieo xúc xắc trước).

![Nút bị khóa có giải thích](09-disabled-tooltip.png)

## B. Một lượt chơi bình thường

### 10. Gieo xúc xắc
Xúc xắc hiển thị kết quả; các ô có số trúng sinh tài nguyên cho nhà xung quanh (+n trên lá bài, dòng nhật ký).

![Gieo xúc xắc](10-roll-dice.png)

### 11. Sau khi gieo: giai đoạn chính
Có thể xây, mua thẻ, đổi bài hoặc kết thúc lượt. Nút nào không đủ tài nguyên thì mờ đi.

![Sau khi gieo: giai đoạn chính](11-after-roll-main.png)

### 12. Lượt có nhiều lựa chọn
Đủ tài nguyên để xây đường, làng và mua thẻ; bảng Chi phí đánh dấu ✓ những thứ đang mua được.

![Lượt có nhiều lựa chọn](12-main-rich.png)

### 13. Xây đường: chọn cạnh
Các cạnh nối với mạng lưới của mình được tô sáng; nút đang chọn có trạng thái "đang chọn", có thể hủy.

![Xây đường: chọn cạnh](13-build-road-pick.png)

### 14. Đã xây đường
Tài nguyên bị trừ, số đường còn lại giảm, nhật ký ghi lại.

![Đã xây đường](14-build-road-done.png)

### 15. Xây làng: chọn giao điểm
Chỉ các giao điểm nằm trên đường của mình và cách nhà khác ≥ 2 cạnh.

![Xây làng: chọn giao điểm](15-build-settlement-pick.png)

### 16. Đã xây làng (+1 điểm)

![Đã xây làng (+1 điểm)](16-build-settlement-done.png)

### 17. Mua thẻ phát triển
Thẻ mới mua có nhãn "mới" và chỉ dùng được từ lượt sau.

![Mua thẻ phát triển](17-buy-card.png)

### 18. Nâng cấp thành phố: chọn làng
Chỉ các làng của mình được tô sáng.

![Nâng cấp thành phố: chọn làng](18-build-city-pick.png)

### 19. Đã có thành phố (+1 điểm, sản xuất gấp đôi)

![Đã có thành phố (+1 điểm, sản xuất gấp đôi)](19-build-city-done.png)

### 20. Kết thúc lượt → chuyền máy cho người kế tiếp

![Kết thúc lượt → chuyền máy cho người kế tiếp](20-end-turn-cover.png)

## C. Đổi bài

### 21. Đổi với ngân hàng khi chưa đủ lá
Không có loại nào đủ 4 lá (hoặc 3/2 với cảng): hộp thoại giải thích thay vì để trống.

![Đổi với ngân hàng khi chưa đủ lá](21-bank-trade-not-enough.png)

### 22. Đổi với ngân hàng: chọn loại đưa đi
Mỗi loại ghi số đang có và tỷ lệ (4:1, hoặc 3:1 / 2:1 nếu có cảng).

![Đổi với ngân hàng: chọn loại đưa đi](22-bank-trade-dialog.png)

### 23. Đổi với ngân hàng: chọn loại nhận về

![Đổi với ngân hàng: chọn loại nhận về](23-bank-trade-get.png)

### 24. Đổi với ngân hàng: xác nhận

![Đổi với ngân hàng: xác nhận](24-bank-trade-confirm.png)

### 25. Đã đổi với ngân hàng

![Đã đổi với ngân hàng](25-bank-trade-done.png)

### 26. Có cảng: tỷ lệ đổi tốt hơn
Người chơi có nhà ở cảng 2:1 / 3:1 thấy tỷ lệ tương ứng.

![Có cảng: tỷ lệ đổi tốt hơn](26-harbor-trade.png)

### 27. Đổi bài với người chơi: soạn đề nghị
Chọn lá mình đưa và lá muốn nhận; đề nghị gửi cho mọi người chơi khác.

![Đổi bài với người chơi: soạn đề nghị](27-player-trade-compose.png)

### 28. Đề nghị đã điền
Ví dụ: đưa 1 Gỗ, nhận 1 Quặng. Nút "Gửi đề nghị" sáng lên khi hợp lệ.

![Đề nghị đã điền](28-player-trade-filled.png)

### 29. Đề nghị đang mở: chờ trả lời
Thanh hành động có nút "Hủy đề nghị"; tab "Đổi bài" ở cột phải hiện trạng thái.

![Đề nghị đang mở: chờ trả lời](29-player-trade-waiting.png)

### 30. Có người chấp nhận: tab "Đổi bài" ở cột phải
Câu trả lời của từng người (đã từ chối / đã chấp nhận / chưa trả lời).

![Có người chấp nhận: tab "Đổi bài" ở cột phải](30-trade-tab.png)

### 31. Chọn người để chốt
Trong hộp thoại, mỗi người đã chấp nhận có nút "Chốt với …"; có thể chờ thêm hoặc hủy đề nghị.

![Chọn người để chốt](31-trade-pick-partner.png)

### 32. Đã chốt giao dịch
Hai bên trao bài; nhật ký ghi lại giao dịch.

![Đã chốt giao dịch](32-trade-confirmed.png)

## D. Gieo ra 7: bỏ bài, kẻ cướp, cướp bài

### 33. Gieo ra 7: phải bỏ một nửa số bài
Ai có hơn 7 lá phải bỏ một nửa (làm tròn xuống) trước khi dời kẻ cướp.

![Gieo ra 7: phải bỏ một nửa số bài](33-discard-dialog.png)

### 34. Đã chọn đủ số lá để bỏ

![Đã chọn đủ số lá để bỏ](34-discard-filled.png)

### 35. Dời kẻ cướp
Các ô có thể đặt kẻ cướp được tô sáng (không được giữ nguyên chỗ cũ).

![Dời kẻ cướp](35-move-blocker.png)

### 36. Sau khi dời kẻ cướp → chọn người bị cướp
Nếu có nhiều người có nhà quanh ô đó thì hỏi cướp của ai; nếu chỉ một người thì cướp tự động. Ô bị chặn không sản xuất.

![Sau khi dời kẻ cướp → chọn người bị cướp](36-after-move-blocker.png)

### 37. Cướp của ai?
Khi có nhiều người quanh ô bị chặn, chọn một người để cướp ngẫu nhiên 1 lá (thấy số lá trên tay họ).

![Cướp của ai?](37-steal-dialog.png)

### 38. Đã cướp bài
Thông báo nhỏ cho biết đã lấy được lá gì.

![Đã cướp bài](38-steal-done.png)

## E. Thẻ phát triển

### 39. Có thẻ Hiệp sĩ để dùng
Thẻ đã giữ từ lượt trước hiện nút "Dùng thẻ: …" trên thanh hành động (mỗi lượt tối đa 1 thẻ).

![Có thẻ Hiệp sĩ để dùng](39-card-knight-ready.png)

### 40. Dùng Hiệp sĩ → dời kẻ cướp
Có thể dùng trước khi gieo xúc xắc; tính vào "Đạo quân hùng mạnh nhất".

![Dùng Hiệp sĩ → dời kẻ cướp](40-card-knight-move.png)

### 41. Năm sung túc: chọn 2 tài nguyên từ ngân hàng
Mỗi nút là một cặp tài nguyên nhận về.

![Năm sung túc: chọn 2 tài nguyên từ ngân hàng](41-card-harvest-dialog.png)

### 42. Năm sung túc: đã nhận bài
Hộp thoại đóng, 2 lá mới vào tay (+n trên lá bài).

![Năm sung túc: đã nhận bài](42-card-harvest-done.png)

### 43. Độc quyền: chọn 1 loại tài nguyên
Mọi người khác phải đưa hết lá loại đó cho mình.

![Độc quyền: chọn 1 loại tài nguyên](43-card-claim-dialog.png)

### 44. Độc quyền: kết quả
Hộp thoại đóng; nhật ký ghi số lá thu được từ những người khác.

![Độc quyền: kết quả](44-card-claim-done.png)

### 45. Thẻ Xây đường: đặt 2 đường miễn phí
Các cạnh hợp lệ được tô sáng, đặt lần lượt 2 đường.

![Thẻ Xây đường: đặt 2 đường miễn phí](45-card-freeroads.png)

### 46. Thẻ Xây đường: đường thứ hai

![Thẻ Xây đường: đường thứ hai](46-card-freeroads-second.png)

## F. Danh hiệu và kết thúc ván

### 47. Danh hiệu "Đường dài nhất" (+2 điểm)
Ai có tuyến đường liên tục ≥ 5 đoạn dài nhất; biểu tượng hiện ở thẻ người chơi.

![Danh hiệu "Đường dài nhất" (+2 điểm)](47-award-longest-road.png)

### 48. Danh hiệu "Đạo quân hùng mạnh nhất" (+2 điểm)
Ai đã dùng ≥ 3 Hiệp sĩ nhiều nhất.

![Danh hiệu "Đạo quân hùng mạnh nhất" (+2 điểm)](48-award-largest-army.png)

### 49. Sát nút: 9/10 điểm
Người chơi chỉ cần thêm 1 điểm.

![Sát nút: 9/10 điểm](49-before-win.png)

### 50. Chiến thắng!
Đạt 10 điểm trong lượt của mình: hộp thoại chiến thắng, có thể xuất log hoặc bắt đầu ván mới.

![Chiến thắng!](50-winner.png)

## G. Các màn hình phụ

### 51. Hướng dẫn nhanh (nút ?)

![Hướng dẫn nhanh (nút ?)](51-help.png)

### 52. Xuất log ván đang chơi
Lưu lại để nạp tiếp ở "Nạp ván từ log".

![Xuất log ván đang chơi](52-export-log.png)

### 53. Bàn cờ 3D
Nút 2D/3D ở góc trên; có thể xoay / phóng to.

![Bàn cờ 3D](53-board-3d.png)

### 54. Giao diện tiếng Anh
Nút chuyển ngôn ngữ ở góc trên.

![Giao diện tiếng Anh](54-english.png)

## H. Chơi trực tuyến

### 55. Chơi trực tuyến: tạo phòng hoặc vào phòng bằng mã
Nhập tên hiển thị, số người, chế độ; hoặc nhập mã phòng 5 ký tự để vào phòng của bạn bè.

![Chơi trực tuyến: tạo phòng hoặc vào phòng bằng mã](55-online-create.png)

### 56. Phòng chờ
Mã phòng để mời bạn; chủ phòng chọn bot cho ghế trống và bắt đầu.

![Phòng chờ](56-online-lobby.png)

## I. Chơi thật với 3 bot

### 57. Bot gửi đề nghị đổi bài cho mình
Chọn Chấp nhận / Từ chối / Trả giá; có đồng hồ đếm ngược trước khi đề nghị hết hạn.

![Bot gửi đề nghị đổi bài cho mình](57-bot-offer-respond.png)

### 58. Ván với bot: sau khi từ chối đề nghị
Tên bot có biểu tượng và độ khó; không có màn che chuyền máy khi chỉ có 1 người chơi thật.

![Ván với bot: sau khi từ chối đề nghị](58-bots-after-decline.png)

## Lỗi phát hiện khi chụp (2026-11-18)

1. **Đã sửa:** chơi chung máy mà toàn người, người đạt 10 điểm thì app quay về màn hình chính, không hiện hộp thoại
   chiến thắng (lúc hết ván không ai còn nước đi nên góc nhìn bị đặt về rỗng). Sửa trong `packages/client/src/App.tsx`:
   giữ góc nhìn của người xem cuối (hoặc người thắng). Nạp log của một ván đã kết thúc cũng vì thế mà trước đây về màn hình chính.
2. **Đã sửa:** dùng thẻ Năm sung túc / Độc quyền xong, hộp thoại vẫn mở và ghi "Không có lựa chọn nào hợp lệ lúc này".
   Sửa trong `packages/client/src/table/GameTable.tsx`: chọn xong thì đóng hộp thoại.
3. **Chưa sửa (cần PO quyết):** chơi chung máy mà toàn người, người nhận đề nghị đổi bài không có cách nào để trả lời:
   màn hình luôn ở người đang tới lượt (người đề nghị), nên đề nghị chỉ có thể bị hủy. Trả lời được khi chơi với bot
   (ảnh 57) hoặc trực tuyến. Cách sửa gợi ý: khi người đề nghị bấm "Chờ trả lời", lần lượt chuyền máy cho từng người
   còn lại (có màn che) để họ Chấp nhận / Từ chối / Trả giá.
