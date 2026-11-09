# Publishing Quiet Hall on the Solana dApp Store (Seeker)

Checked against the official docs on 2026-11-09:
- https://docs.solanamobile.com/dapp-publishing/publishing-a-pwa
- https://docs.solanamobile.com/cli/webshell
- https://docs.solanamobile.com/dapp-store/submit-new-app.md
- https://docs.solanamobile.com/dapp-store/listing-page-guidelines.md

The store takes an Android APK. For a web app (PWA) like ours, Solana Mobile now recommends their **`solana-mobile webshell`** CLI. It wraps the site in a native shell that handles wallet (Mobile Wallet Adapter) intents itself. Bubblewrap/TWA wrappers can break wallet connections, so we don't use them, and no `assetlinks.json` is needed.

Store fee: 0% commission, including in-app purchases. Review: 3–4 business days for a new app, 1–2 for updates.

---

## 0. Decide: devnet test mode or mainnet

The live app runs on **devnet**: payments use test tokens. You can publish like that, but the listing mentions real payments (SOL/USDC/SKR), so we recommend switching to mainnet first (section 5). Everything below works either way.

## 1. Fill in the last details (5 min)

1. Pick the **support email** and replace `SUPPORT_EMAIL` in `public/privacy.html` and `public/terms.html`.
2. Check the **package name** in `store/listing.md` (`build.caliber.quiethall`). It can never change after the first upload.
3. Deploy: `npm run deploy && npx vercel --prod`.
4. Open these on your phone and check they load: https://quiet-hall.vercel.app, `/privacy.html`, `/terms.html`. Broken links are the most common rejection.

## 2. Build the APK (about 15 min, on this Mac)

JDK 17 (`/opt/homebrew/opt/openjdk@17`) and the Android SDK (`~/Library/Android/sdk`) are already installed.

```bash
cd ~/Work/AppStore/SolanaMobileGames/QuietHall
npx solana-mobile@latest doctor          # checks JDK / Android SDK

# one time: creates the Android project in ./android and a NEW signing keystore
npx solana-mobile@latest webshell init android \
  --url https://quiet-hall.vercel.app \
  --application-id build.caliber.quiethall \
  --keystore-path ./android/quiethall-dapp-store.keystore

# every release
npx solana-mobile@latest webshell build android
# → android/app/build/outputs/apk/release/app-release.apk
```

- The CLI reads the name, icons and colours from `/manifest.webmanifest` (already updated with the new icon). If a flag name differs in your CLI version, run `npx solana-mobile@latest webshell init --help`.
- **Back up the keystore and its passwords** (password manager plus an offline copy). If you lose them, you can never update the app. Use a separate key from any Google Play key. `android/*.keystore` is gitignored.
- For later releases, bump the version when the CLI asks, or in `android/twa-manifest.json` (`appVersionCode` +1).
- Test it: `adb install android/app/build/outputs/apk/release/app-release.apk` on the Seeker, then:
  1. Open the app and enter the hall.
  2. Tap 👛, then **Use Installed Wallet**, sign in, and check you get the gold light.
  3. Buy a blessing (devnet) and check the wallet approves and the sparkles appear.
  4. Sit for a minute.
  5. Turn on airplane mode and check that a solo sit still works.

## 3. Publisher Portal (one time, plus KYC wait)

1. Sign up at **https://publish.solanamobile.com** with your email.
2. Create the **publisher profile** and finish **KYC** (individual) or **KYB** (company). You can't add a dApp until it's approved.
3. Connect a **publisher wallet** (browser extension, e.g. Phantom or Solflare desktop).
   - Use a new wallet just for publishing, with about 0.1 SOL on mainnet. Every future release is signed with this wallet, so back it up.
   - The exact SOL cost isn't published; it covers minting the App NFT and release NFTs plus storage.

## 4. Submit the app

1. **Add a dApp** and fill it in from `store/listing.md`: name, short and long description, website, privacy URL, terms URL, support and contact email.
   - The package name must equal the APK application id.
   - Saving mints the **App NFT**; approve it in the wallet.
2. Upload the media:
   - Icon: `store/icon-512.png`
   - Banner: `store/banner-1200x600.png`
   - Screenshots: `store/screenshots/01…06.jpg`. All are 1080×1920, 9:16, and the guidelines want 4–8.
3. **Releases → New Version**: upload `app-release.apk`, add the "What's new" text from `store/listing.md`, and sign every wallet request.
4. Wait for review (3–4 business days). Category is set at approval.

Later updates can use the CLI instead of the portal:
`npx @solana-mobile/dapp-store-cli --apk-file android/app/build/outputs/apk/release/app-release.apk --keypair <publisher-keypair.json> --whats-new "..."` with `DAPP_STORE_API_KEY` set (see https://docs.solanamobile.com/dapp-store/publishing-cli.md).

---

## 5. Switch the hall to mainnet (recommended before launch)

Spec 006 T221. The code is ready; these are config steps.

1. **Wallets** (create new ones, never reuse test keys):
   - **Receiving wallet** for payments and royalties → `TIP_RECIPIENT`.
   - **Treasury key** that mints stone/tree NFTs. Fund it with about 0.2 SOL (each NFT mint costs about 0.003 SOL in rent). Then `npx wrangler secret put TREASURY_KEY` (base58 secret key).
2. **Collections on mainnet:**
   - Put the treasury key in `.dev.vars` as `DEV_NET_SOL` temporarily.
   - In `scripts/setup-collections.mjs` and `scripts/set-royalties.mjs`, change `RPC` to a mainnet RPC (your Helius mainnet URL).
   - Run both scripts. Copy the new collection addresses into `wrangler.toml`.
   - Then put the devnet key back.
3. **`wrangler.toml` `[vars]`:**
   ```toml
   SOLANA_CLUSTER = "mainnet"
   SOLANA_RPC = "https://api.mainnet-beta.solana.com"   # Helius is used automatically when HELIUS_API_KEY is set
   USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
   SKR_MINT = "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3"   # turns on "Pay with SKR"
   SKR_PER_USDC = "50"                                      # set from the SKR market price; prices = USDC × this
   TIP_RECIPIENT = "<receiving wallet>"
   STONE_COLLECTION = "<mainnet>"
   TREE_COLLECTION = "<mainnet>"
   ```
   Your Helius key works on mainnet too.
4. **`.env.production`:** add `VITE_SOLANA_CLUSTER=mainnet`. This hides the "test mode" and faucet text and asks wallets for mainnet.
5. **Prices** (`worker/ledger.ts` `PRICES`): the SOL prices were set low for devnet. Re-check them against USDC; for example, a stone at 0.025 SOL vs 24 USDC is far apart.
6. **Data:** the live hall still holds test pets, blessings, lanterns and stone/tree owners from devnet.
   - The simplest reset is to rename the Durable Object in `wrangler.toml` (`idFromName('main')` → new name) or add a migration.
   - Tell me and I'll do it.
7. Deploy, then run on mainnet with a small real purchase: one blessing in SOL, one in USDC, one in SKR.

## 6. Before you hit submit (checklist)

- [ ] Support email filled in; privacy and terms pages load on the phone
- [ ] Mainnet switch done (or you consciously ship devnet test mode)
- [ ] APK installed on the Seeker: wallet connect, sign in, a payment, a sit, offline sit
- [ ] Keystore and passwords backed up
- [ ] Publisher wallet backed up and funded
- [ ] Icon, banner, 6 screenshots, texts from `store/listing.md`
