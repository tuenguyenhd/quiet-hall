# Hướng dẫn nộp bài NEAR Hackathon (làm dần từng bước)

> Luật chính thức: https://nearhackathon.com/HACKATHON.md (nên đọc lại ngay trước khi nộp, vì luật có thể đổi).
> Form nộp: https://nearhackathon.com/#apply
> **Hạn chót: 14/11/2026 23:59 UTC = 06:59 sáng 15/11/2026 giờ Việt Nam.**
> Bản tiếng Anh, có sẵn nội dung điền form: [SUBMISSION.md](SUBMISSION.md)

## Luật cần nhớ

- **Chỉ nộp 1 lần.** Sau khi gửi thì không sửa được. Gửi lại cùng repo sẽ bị từ chối (lỗi 409). Muốn sửa thì gửi yêu cầu ở https://nearhackathon.com/request-changes.
- **Không cần đăng ký trước.** Lần nộp chính là lần đăng ký.
- **Bắt buộc có 2 link:**
  - repo GitHub **public**;
  - bài đăng X (Twitter) có video hoặc ảnh demo.
- **Chỉ chạy trên testnet vẫn được** (luật Q-010).
- **Cách chấm:** Claude Code và Codex chạy thử repo trước, xem có chạy được và đúng như README không. Sau đó giám khảo người chấm.
- **Track:** chọn `games`. Có thể tick thêm `nfts` và `agents`.
- **Toàn bộ code tính là làm trong hackathon:** hackathon tính từ 19/10, còn commit đầu tiên của repo là 09/11.
- **Demo online:** không bắt buộc nhưng là điểm cộng. Nên giữ chạy tới 18/11, tốt nhất tới 25/11.

## Phần A: phần kỹ thuật (Claude làm, khi bạn nói "OK")

- [ ] **A1. Merge** `drops-integration` vào `near-hackathon`. Nhánh này gồm drops, bỏ Leaves, sửa bug QA, README, LICENSE và `test:near`. Quyết định thêm: có gộp pet meme (`meme-pets`) vào luôn không?
- [ ] **A2. Deploy** bản mới lên https://quiet-hall-near.ted-233.workers.dev (bản đang chạy còn cũ: vẫn có Leaves, chưa có drops).
- [ ] **A3. Đặt secret** `CAMPAIGN_ADMIN_KEY` trên Worker. Tạo 1 chiến dịch drop mẫu để giám khảo thấy (ví dụ BONK ở Courtyard).
- [ ] **A4. Nâng cấp contract production** `quiethall-521e7c.testnet` để có `mint_badge` / `commit_campaign`.
- [ ] **A5. Chạy smoke test production:** `node scripts/near-prod-smoke.mjs <demo-url>`.
- [ ] **A6. Đưa repo lên GitHub ở chế độ public.**
  - Nếu không muốn lộ email, Claude có thể đổi tác giả sang email no-reply của GitHub **trước khi** đẩy lên.
  - Bạn quyết định chọn cách nào.
- [ ] **A7. Kiểm tra lại từ bản clone sạch:**
  - lệnh: `npm ci && npm run check && npm run build:near && npm run test:near`;
  - đã pass ngày 13/11 (6 suite, 166 check);
  - chạy lại sau khi merge.

## Phần B: phần bạn tự làm

- [ ] **B1. Ví NEAR mainnet** để nhận giải, ví dụ `tedorg.near` (nếu thắng, tiền giải gửi về đây).
- [ ] **B2. Quay video demo** (~90 giây, không giới hạn độ dài, quay trên điện thoại cho đẹp):
  1. Quick join, rồi ngồi thiền (Sit).
  2. Theo đèn lồng tới Meme Valley, giúp Shibby (có người thứ 2 ngồi cùng thì càng tốt), rồi bấm "receipt" để thấy token trên explorer.
  3. Trong Claude Code (MCP), gõ 1 câu prompt. Drops xuất hiện trong game. Nhặt đủ 3 cái để nhận badge và link claim.
  4. Vào Market, tham gia trading game. Mở một round đã settle bằng `verify-round`.
  5. Lướt qua khu Coming Soon (Clans, Events).
- [ ] **B3. Đăng bài X.**
  - Bắt buộc có: "built at NEAR HACKATHON", @NEARProtocol, #NEARHackathon, kèm video.
  - Tag thêm nếu muốn: @NearLegion, @NearBuilders.
  - Bản nháp có sẵn trong [SUBMISSION.md](SUBMISSION.md).
- [ ] **B4. Đọc lại `NEAR.md`.** Đây là README giám khảo sẽ đọc; sửa câu chữ nếu muốn.

## Phần C: nộp bài (bước cuối, chỉ 1 lần)

Mở https://nearhackathon.com/#apply rồi điền:

| Ô | Điền gì |
|---|---|
| Project name | Quiet Hall: rest after a trading day |
| Team lead | Tên bạn |
| Email | Email của bạn (riêng tư, ban tổ chức dùng để liên lạc) |
| Team size | `1` |
| Tracks | `games` (+ `nfts`, `agents`) |
| NEAR wallet | Ví mainnet ở B1 |
| Repository link | Link GitHub ở A6 |
| Demo post link | Link bài X ở B3 |
| What did you build? | Copy đoạn tiếng Anh trong [SUBMISSION.md](SUBMISSION.md) (1.565 / 2.000 ký tự) |
| Đồng ý (checkbox) | Tick |
| Website | **Để trống.** Đây là ô bẫy spam, điền vào sẽ bị loại |

Trước khi bấm gửi, kiểm tra:

- [ ] Repo đã public và mở được khi chưa đăng nhập.
- [ ] Demo online đang chạy bản mới.
- [ ] Bài X public.
- [ ] Đã bấm gửi **một lần duy nhất**. Chụp màn hình xác nhận để lưu.

## Lịch đề xuất

| Khi nào (giờ VN) | Việc |
|---|---|
| 13/11 tối | A1–A5 (Claude), B1 |
| 14/11 sáng | A6–A7, B2 quay video |
| 14/11 chiều | B3 đăng X, B4 đọc README |
| 14/11 tối (trước 06:59 sáng 15/11) | Phần C: nộp bài. Đừng để sát giờ |
