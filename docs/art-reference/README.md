# Tài liệu tham chiếu đồ họa (từ rulebook PDF)

Mục đích: thu thập và phân tích hình ảnh, minh họa, thành phần vật lý trong 4 rulebook PDF để làm tài liệu tham chiếu khi làm lại đồ họa game.

> **Lưu ý bản quyền:** Các PDF và hình ảnh trong thư mục này thuộc CATAN GmbH. Chỉ dùng làm **tham chiếu nội bộ** (bố cục, màu sắc, tỷ lệ, cách nhận diện thành phần). Không đưa nguyên hình vào sản phẩm phát hành. Nên vẽ lại hoàn toàn bằng asset mới.

## 1. Nguồn

| Thư mục | File gốc | Số trang | Ảnh trích (>=200px) | Nội dung chính |
|---|---|---|---|---|
| `base/` | CN3081 The Game Rulebook | 12 | 52 | Luật cơ bản, bố trí, thành phần, thẻ, quân cờ |
| `5-6-base/` | CN3082 5-6 Rulebook 2025 | 4 | 3 | Luật cho 5-6 người chơi (ít ảnh, chủ yếu bảng) |
| `cities-knights/` | CN3087 Cities & Knights | 16 | 77 | Mở rộng: thẻ tiến bộ, thành, hiệp sĩ, cảng |
| `5-6-ck/` | CN3088 C&K 5-6 | 4 | 7 | Mở rộng cho 5-6 người |

Trong mỗi thư mục:
- `pXX-NNN-WxH.png`: ảnh gốc được trích từ PDF (giữ nguyên độ phân giải gốc).
- `_page-XX.png`: ảnh render cả trang ở 60 DPI, dùng để xem bố cục.

Tổng: **139 ảnh trích** + **36 trang render** (tổng 16 + 12 + 4 + 4 = 36 trang).

## 2. Phân loại ảnh có giá trị làm đồ họa

### 2.1 Bìa và minh họa nghệ thuật (tham chiếu phong cách)
- `base/p01-001` - Bìa rulebook cơ bản.
- `cities-knights/p01-001` - Bìa Cities & Knights: tông vàng cam, ánh mặt trời lớn, đồi núi, thành trì, đồng cỏ. Đây là **tham chiếu phong cách tốt nhất** cho màu nền và cảm xúc tổng thể.
- `base/p02-002`, `p02-003`: ảnh giới thiệu, hình biển và đảo.
- `5-6-base/p02-001`, `p02-002`: ảnh minh họa cho bản 5-6.

### 2.2 Thành phần vật lý (hexes, quân cờ, thẻ, xúc xắc)
- `base/p03-004` đến `p03-022`: **trang COMPONENTS**. Đây là nguồn chính để hiểu bộ thành phần đầy đủ:
  - 19 hexes địa hình (đồi, rừng, đồng cỏ, đồng ruộng, núi, sa mạc) - ảnh `p03-004`, `p03-005`...
  - 6 hex biển (khung viền bờ biển) - `p03-014`, `p03-015`
  - 18 number discs (số 2-12) - `p03-009` đến `p03-013`
  - 2 bonus VP tile: Longest Route và Largest Army - `p03-016`, `p03-017`
  - 4 player aids - `p03-018`, `p03-019`
  - Thẻ phát triển (Development cards) và thẻ tài nguyên - `p03-020` đến `p03-022`
  - Quân cờ: 20 thị trấn, 16 thành phố, 60 đường, 1 robber, 2 xúc xắc - nhóm ảnh trang 3 (đã có trong `p03-*`)
- `base/p04-023` (1136x1865): **Fixed setup**, gồm sơ đồ bố trí bàn chơi chuẩn và cấu trúc khung biển.
- `base/p05-030` (1019x1865): Bố trí robber và người chơi, sơ đồ tài nguyên khởi đầu.
- `base/p05-031` đến `p05-034`: ảnh thẻ tài nguyên phóng to.

### 2.3 Bàn chơi và sơ đồ xây dựng
- `base/p07-038`, `p08-039`: sơ đồ xây dựng đường, khu dân cư, thành phố (có chú thích chi phí).
- `base/p08-040`, `p08-041`, `p08-042`: chi phí xây dựng (BUILDING COST) - dùng để thiết kế icon chi phí.
- `base/p10-046`, `base/p11-049`: ví dụ bàn chơi và khoảng cách đường đi.
- `base/p11-050`, `p11-051`, `base/p12-052`: ví dụ trade và sơ đồ đường dài nhất (Longest Route).

### 2.4 Thẻ phát triển và thẻ tiến bộ (Cities & Knights)
- `cities-knights/p13` đến `p16` (mỗi trang ~8-9 thẻ kèm mô tả): **Progress Cards** gồm nhóm:
  - Science (Alchemy, Crane, Engineering, Invention, Irrigation, Medicine...) - p13
  - Trade và Politics - p14 đến p16
  - Mỗi thẻ có ảnh minh họa 298x268 px. Đây là **tập ảnh thẻ phong phú nhất** để làm thẻ mới.
- `cities-knights/p02` đến `p10`: các ảnh sơ đồ và minh họa luật C&K (thành phố, hiệp sĩ, chi phí nâng cấp, barbarian). Chưa phân loại chi tiết từng ảnh; cần mở ảnh để xác nhận trước khi dùng.
- `cities-knights/p05-020` đến `p05-023` (243x345 px): kích thước giống thẻ, có khả năng là thẻ commodity. Cần kiểm tra.

### 2.5 Biểu tượng và icon
- Các ảnh nhỏ (<200px) không được trích tự động. Nếu cần icon, cần cắt thủ công từ trang render `_page-XX.png` hoặc từ PDF gốc.
- Icon tài nguyên hiện tại trong game đã có sẵn ở `packages/client/public/assets/icon/` (brick, wood, wool, wheat, ore và phiên bản CK).

## 2.6 Nhóm đã tách sẵn: hex địa hình

Thư mục `groups/terrain/` chứa hex đã tách nền thành trong suốt (PNG, cắt sát viền):

| File | Nguồn | Ghi chú |
|---|---|---|
| `fields.png` | `base/p03-010` | đồng ruộng (lúa vàng) |
| `pastures.png` | `base/p03-011` | đồng cỏ (xanh lá) |
| `forests.png` | `base/p03-012` | rừng (xanh đậm) |
| `hills.png` | `base/p03-013` | đồi (đất đỏ cam) |
| `mountains-a/b/c.png` | `base/p03-018`, `019`, `020` | 3 hex núi đúng số lượng trong bộ |
| `mountains-extra.png` | `base/p03-009` | biến thể núi thứ 4, dư so với bộ chơi, không cần dùng |

Chưa có: hex **sa mạc** (desert, 1 cái, màu cát). Không nằm trong trang COMPONENTS đã trích; cần tìm ở trang khác hoặc render từ PDF.

Bảng ảnh kiểm tra: `groups/_sheet_terrain.png`.

## 2.7 Toàn bộ nhóm đã tách (thư mục `groups/`)

Ảnh đã tách nền trong suốt khi cần. Nguồn chính là trang COMPONENTS của CN3081, render ở 200 DPI rồi cắt thủ công.

| Nhóm | File | Ghi chú |
|---|---|---|
| terrain | `fields, pastures, forests, hills, mountains-a/b/c, desert` | 7 hex đủ. `desert` bị khuyết một cạnh vì hex bên cạnh chồng lên trong trang gốc |
| resources | `brick, wood, wool, wheat, ore, card-back` | 5 loại thẻ tài nguyên base + mặt sau |
| dev-cards | `knight, monopoly, road-building, invention, victory-point, card-back` | 6 loại thẻ phát triển chính |
| pieces | `settlements, cities, roads, robber` | 4 màu (xanh, đỏ, trắng, cam). Đã bỏ chữ chú thích |
| dice | `dice-both` | xúc xắc đỏ và vàng |
| number-discs | `02, 03, 04, 05, 06, 08, 09, 10, 11, 12` | 10 số trong 9 ảnh; `all.png` là ảnh tổng |
| awards | `longest-route, largest-army` | 2 thẻ VP đặc biệt |
| player-aids | `front, back` | bảng chi phí xây dựng và tóm tắt lượt |
| cities-knights/progress-illustrations | 27 ảnh | minh họa thẻ tiến bộ (Science, Trade, Politics) |
| cities-knights/card-frame-templates | 5 ảnh | khung thẻ C&K, dùng làm mẫu để thiết kế thẻ mới |
| cities-knights/commodity-cards | 4 ảnh | thẻ tài nguyên C&K (gỗ, đá, len, lúa) |
| board-and-sea | 6 ảnh | sơ đồ bàn chơi 5-6 người và khúc biển (sea frame) |

Chưa tách riêng: chip cảng 2:1 và 3:1 (nằm trên sea frame), hình bìa hộp và ảnh bàn chơi C&K. Các ảnh này vẫn có trong thư mục gốc `base/`, `cities-knights/`, `5-6-*/`.

Bảng kiểm tra tổng: `groups/_sheet_all.png` (nhóm đầu) và `cities-knights/_sheet_ck.png`, `5-6-sheet.png`.

## 2.8 Nguồn bổ sung: repo BryantCabrera/Settlers-of-Catan (GitHub)

Thư mục `external-soc/` chứa 21 file từ `resources/imgs` của repo (dự án WDI, web jQuery, có giấy phép chưa rõ). Dùng cho mục đích gia đình nội bộ.

| Thư mục | Nội dung | Nhận xét |
|---|---|---|
| `hexes/` | 6 hex 300 DPI (~1000 px): desert, field, forest, hill, mountain, pasture | Là ảnh chụp bộ cờ vật lý, có ánh sáng và bóng thật. Độ nét tốt hơn ảnh rulebook |
| `number-tokens/` | 1 sheet 1816x3372 chứa đủ 18 số | Nền trắng sạch, cắt được từng token |
| `pieces/` | 1 sheet 2136x3480 với đường, thị trấn, thành phố (4 màu) | Ảnh chụp, cần cắt từng món |
| `harbors/` | 1 sheet 935x1098 | Có ảnh xanh biển, nên kiểm tra lại trước khi dùng |
| `resources/` | 1 sheet thẻ tài nguyên 642x948 (RGBA) | Thẻ có nền trong suốt |
| `dev-cards/` | 1 sheet thẻ phát triển (ví dụ University) | Ảnh chụp thẻ thật |
| `dice/` | 6 SVG/PNG 300 px có alpha | Mặt xúc xắc vector đơn giản |
| `robber/` | robber 300 px | Vector |
| `special-cards/`, `building-costs/` | thẻ Army, Road, building cost (vector) | Thẻ đặc biệt |
| `_preview.png` | ảnh xem nhanh 4 file | |

Lưu ý kỹ thuật:
- Các SVG hex trong repo (`hexes/vector/*.svg`) **chỉ bọc ảnh raster** (`<image>`), không phải vector thật, nên không tốt hơn bản hiện có.
- SVG trong `packages/client/public/assets/` của game là **vector thật** (ví dụ thành phố 25 path, thẻ tiến bộ 24 path). Đây là nền tảng tốt để vẽ lại.
- Các file `.psd` gốc (hex, resource, dice, robber, special card) có trong repo nhưng chưa được tải về vì nặng (~0.5–2 MB mỗi file). Có thể lấy nếu cần chỉnh sửa lớp.

## 3. So sánh với asset hiện tại của game

Game đang dùng SVG tại `packages/client/public/assets/`. Bảng ánh xạ:

| Nhóm asset trong game | File hiện có | Tương ứng trong rulebook |
|---|---|---|
| terrain | `field, forest, meadow, claypit, quarry, waste, sea` | hexes: fields, forests, pastures, hills, mountains, desert |
| resource | `clay, fiber, grain, stone, timber, linen, books, silver` | brick, wool, wheat, ore, wood + commodity (cloth, paper, coin) |
| piece | `road, settlement, city, blocker` | roads, settlements, cities, robber |
| card | `card/back, card/claim, card/guard, card/harvest, card/relic, card/freeRoads` | development cards và progress cards |
| award | `award/longestRoute, award/largestForce` | Longest Route và Largest Army |
| dice | `dice/1` đến `dice/6` | 2 dice |
| harbor | `harbor/any, clay, fiber, grain, stone, timber` | harbor (2:1 và 3:1) |

Điểm cần chú ý khi làm lại:
- Tên hex trong rulebook là "hills/mountains/pastures" nhưng trong code là "claypit/quarry/meadow". Đây là đúng, không cần đổi, chỉ cần giữ bảng ánh xạ.
- Game hiện có 5 mặt thẻ phát triển (relic, harvest, guard, freeRoads, claim) cộng mặt sau. Thẻ tiến bộ C&K có nhiều loại hơn (nhóm Science, Trade, Politics ở trang 13-16 của CN3087), nên thiếu nhiều thẻ so với rulebook.
- Tên ảnh trong rulebook có bản Anh; cần thống nhất tên thẻ/tài nguyên tiếng Việt cho UI nếu game hiển thị tiếng Việt.

## 4. Đề xuất bước tiếp theo
1. Chọn phong cách: dùng bìa C&K (`cities-knights/p01-001`) làm mood board.
2. Lập danh sách asset cần làm mới theo mục 3, ưu tiên: hexes (terrain), thẻ tài nguyên, quân cờ, dice.
3. Với 3D (`packages/client/src/board3d/`): hexes và quân cờ hiện là prism + texture SVG. Hình trang COMPONENTS (`base/p03`) cho thấy tỷ lệ và màu sắc gốc của quân cờ (đỏ, xanh dương, trắng, cam).
4. Nếu cần model 3D thực sự (quân cờ, thành phố, robber), đây là phần rulebook **không cung cấp**. Có thể dùng `blender.generate_3d` hoặc vẽ lại trong Blender theo tỷ lệ từ ảnh.

## 5. Cách tái tạo thư mục này
Script trích dùng PyMuPDF (`pip install pymupdf`):
- Mở từng PDF, lấy ảnh có chiều rộng và cao >= 200 px, bỏ trùng theo xref, lưu PNG.
- Render mỗi trang ở 60 DPI thành `_page-XX.png`.
