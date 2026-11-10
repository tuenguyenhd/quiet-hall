//! Quiet Hall items contract (NEAR edition, testnet).
//!
//! Design: `design/gdd/edition-near.md`, "Core Rules: chain design".
//!
//! - NEP-171 NFTs for rescued frens, crafted drip and Cup trophies, built on
//!   `near-contract-standards`. Every token is **bound**: transfers always fail.
//! - Only the game account (`owner_id`) can write. Players never sign anything;
//!   tokens are minted to an owner id the game derives for them, which does not
//!   need to exist as an account on chain.
//! - Every write carries a `job_id`; a job id can be used once, so a retried
//!   transaction can never mint or post twice.
//! - The public economy record: the latest market prices (history lives in the
//!   event log) and Cup rounds committed before they start and settled after.
//!
//! Security statement: the game server holds the owner key and is the trust
//! root. This contract makes what the server did public and tamper-evident; it
//! does not hold anything of value.

use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenResolver,
};
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::collections::{LazyOption, LookupMap, LookupSet};
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json};
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, PanicOnDefault, PromiseOrValue,
};
use std::collections::HashMap;

/// Event standard name used in NEP-297 logs for the economy record.
const EVENT_STANDARD: &str = "quiethall";
const EVENT_VERSION: &str = "1.0.0";
const TRANSFERS_DISABLED: &str = "Quiet Hall items are bound to their owner and cannot be transferred";

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    OwnerById,
    TokenMetadata,
    Enumeration,
    Metadata,
    Jobs,
    Rounds,
}

/// One item's quote on Kettle's Living Market, in Leaves (play money).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Quote {
    pub item: String,
    pub bid: u32,
    pub ask: u32,
}

/// The latest hourly price post.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct PricePost {
    /// Hours since the Unix epoch (UTC) that this post describes.
    pub hour: u64,
    pub quotes: Vec<Quote>,
    pub block_timestamp_ns: u64,
}

/// A Market Cup round: committed before it opens, settled after it ends.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Round {
    /// Hex sha256 of the round setup (starting prices + market-maker seed).
    pub setup_hash: String,
    pub committed_at_ns: u64,
    /// The setup text, revealed at settlement. Its sha256 equals `setup_hash`.
    pub setup: Option<String>,
    /// Hex sha256 of the final results file (every entrant's score).
    pub results_hash: Option<String>,
    pub settled_at_ns: Option<u64>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    /// Job ids already used; a job id can be used once.
    jobs: LookupSet<String>,
    latest_prices: Option<PricePost>,
    rounds: LookupMap<String, Round>,
}

fn sha256_hex(data: &[u8]) -> String {
    env::sha256(data).iter().map(|b| format!("{:02x}", b)).collect()
}

fn emit(event: &str, data: serde_json::Value) {
    let log = json!({
        "standard": EVENT_STANDARD,
        "version": EVENT_VERSION,
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{}", log));
}

#[near]
impl Contract {
    /// Initialise with the game account as owner. Only the owner can write.
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        let metadata = NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Quiet Hall".to_string(),
            symbol: "QHALL".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        };
        Self {
            tokens: NonFungibleToken::new(
                StorageKey::OwnerById,
                owner_id,
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                None::<StorageKey>,
            ),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            jobs: LookupSet::new(StorageKey::Jobs),
            latest_prices: None,
            rounds: LookupMap::new(StorageKey::Rounds),
        }
    }

    // ---------- guards ----------

    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only the game account can call this method"
        );
    }

    /// Marks `job_id` as used; panics if it was used before.
    fn use_job(&mut self, job_id: &str) {
        require!(!job_id.is_empty() && job_id.len() <= 64, "Bad job_id");
        require!(self.jobs.insert(&job_id.to_string()), "job_id already used");
    }

    fn mint(&mut self, token_id: TokenId, owner: AccountId, title: String, extra: String) -> Token {
        let metadata = TokenMetadata {
            title: Some(title),
            description: None,
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: Some(env::block_timestamp_ms().to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: Some(extra),
            reference: None,
            reference_hash: None,
        };
        // Storage is paid from the contract's balance (refund_id = None), so the
        // game never has to attach a deposit and players never pay anything.
        self.tokens
            .internal_mint_with_refund(token_id, owner, Some(metadata), None)
    }

    // ---------- receipts (owner only) ----------

    /// A rescued fren: `fren:<species>:<serial>`, bound to `owner`.
    pub fn mint_fren(&mut self, owner: AccountId, species: String, serial: u32, job_id: String) -> Token {
        self.assert_owner();
        self.use_job(&job_id);
        let token_id = format!("fren:{}:{}", species, serial);
        let extra = json!({ "kind": "fren", "species": species, "serial": serial }).to_string();
        self.mint(token_id, owner, format!("{} #{}", species, serial), extra)
    }

    /// A crafted drip item: `drip:<kind>:<serial>`, bound to `owner`.
    pub fn mint_drip(&mut self, owner: AccountId, kind: String, serial: u32, job_id: String) -> Token {
        self.assert_owner();
        self.use_job(&job_id);
        let token_id = format!("drip:{}:{}", kind, serial);
        let extra = json!({ "kind": "drip", "drip": kind, "serial": serial }).to_string();
        self.mint(token_id, owner, format!("{} #{}", kind, serial), extra)
    }

    /// A Market Cup trophy for places 1 to 3: `trophy:<round_id>:<place>`.
    pub fn mint_trophy(&mut self, owner: AccountId, round_id: String, place: u8, job_id: String) -> Token {
        self.assert_owner();
        require!((1..=3).contains(&place), "Trophies are for places 1 to 3");
        require!(
            self.rounds.get(&round_id).map(|r| r.results_hash.is_some()).unwrap_or(false),
            "Round is not settled"
        );
        self.use_job(&job_id);
        let token_id = format!("trophy:{}:{}", round_id, place);
        let extra = json!({ "kind": "trophy", "round": round_id, "place": place }).to_string();
        self.mint(token_id, owner, format!("Market Cup {} place {}", round_id, place), extra)
    }

    // ---------- economy record (owner only) ----------

    /// Posts the latest market quotes. Only the latest post is stored; every
    /// post is also emitted as an event, so history lives in the chain's logs.
    pub fn post_prices(&mut self, hour: u64, quotes: Vec<Quote>, job_id: String) {
        self.assert_owner();
        require!(!quotes.is_empty() && quotes.len() <= 16, "1 to 16 quotes");
        if let Some(prev) = &self.latest_prices {
            require!(hour > prev.hour, "hour must increase");
        }
        self.use_job(&job_id);
        let post = PricePost { hour, quotes, block_timestamp_ns: env::block_timestamp() };
        emit("prices", json!({ "hour": post.hour, "quotes": post.quotes }));
        self.latest_prices = Some(post);
    }

    /// Commits a Cup round before it opens: the sha256 (hex) of its setup.
    pub fn commit_round(&mut self, round_id: String, setup_hash: String, job_id: String) {
        self.assert_owner();
        require!(round_id.len() <= 32, "round_id too long");
        require!(setup_hash.len() == 64, "setup_hash must be 64 hex characters");
        require!(self.rounds.get(&round_id).is_none(), "Round already committed");
        self.use_job(&job_id);
        let round = Round {
            setup_hash: setup_hash.to_lowercase(),
            committed_at_ns: env::block_timestamp(),
            setup: None,
            results_hash: None,
            settled_at_ns: None,
        };
        emit("round_committed", json!({ "round": round_id, "setup_hash": round.setup_hash }));
        self.rounds.insert(&round_id, &round);
    }

    /// Settles a Cup round: reveals the setup (which must hash to the committed
    /// value) and records the hash of the results file.
    pub fn settle_round(&mut self, round_id: String, setup: String, results_hash: String, job_id: String) {
        self.assert_owner();
        let mut round = self.rounds.get(&round_id).unwrap_or_else(|| env::panic_str("Round not committed"));
        require!(round.results_hash.is_none(), "Round already settled");
        require!(setup.len() <= 2048, "setup too long");
        require!(results_hash.len() == 64, "results_hash must be 64 hex characters");
        require!(sha256_hex(setup.as_bytes()) == round.setup_hash, "setup does not match the commitment");
        self.use_job(&job_id);
        round.setup = Some(setup);
        round.results_hash = Some(results_hash.to_lowercase());
        round.settled_at_ns = Some(env::block_timestamp());
        emit(
            "round_settled",
            json!({ "round": round_id, "setup_hash": round.setup_hash, "results_hash": round.results_hash }),
        );
        self.rounds.insert(&round_id, &round);
    }

    // ---------- views ----------

    pub fn latest_prices(&self) -> Option<PricePost> {
        self.latest_prices.clone()
    }

    pub fn round(&self, round_id: String) -> Option<Round> {
        self.rounds.get(&round_id)
    }

    pub fn job_used(&self, job_id: String) -> bool {
        self.jobs.contains(&job_id)
    }

    pub fn game_account(&self) -> AccountId {
        self.tokens.owner_id.clone()
    }
}

// ---------- NEP-171 core: bound tokens ----------

#[near]
impl NonFungibleTokenCore for Contract {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        let _ = (receiver_id, token_id, approval_id, memo);
        env::panic_str(TRANSFERS_DISABLED)
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        let _ = (receiver_id, token_id, approval_id, memo, msg);
        env::panic_str(TRANSFERS_DISABLED)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for Contract {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        // Unreachable: nft_transfer_call always panics before any cross-contract call.
        let _ = (previous_owner_id, receiver_id, token_id, approved_account_ids);
        env::panic_str(TRANSFERS_DISABLED)
    }
}

#[near]
impl NonFungibleTokenEnumeration for Contract {
    fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    fn nft_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const PLAYER: &str = "8f0e5d6c4b3a29180716f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0";

    fn ctx(predecessor: AccountId) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id(accounts(0))
            .predecessor_account_id(predecessor)
            .account_balance(near_sdk::NearToken::from_near(10));
        b
    }

    fn setup() -> Contract {
        testing_env!(ctx(accounts(1)).build());
        Contract::new(accounts(1))
    }

    fn player() -> AccountId {
        PLAYER.parse().unwrap()
    }

    #[test]
    fn mints_fren_to_an_implicit_id_that_never_signed() {
        let mut c = setup();
        let t = c.mint_fren(player(), "shibby".into(), 214, "job-1".into());
        assert_eq!(t.token_id, "fren:shibby:214");
        assert_eq!(t.owner_id, player());
        assert_eq!(c.nft_supply_for_owner(player()), U128(1));
        assert!(c.job_used("job-1".into()));
    }

    #[test]
    #[should_panic(expected = "job_id already used")]
    fn a_job_id_can_be_used_once() {
        let mut c = setup();
        c.mint_fren(player(), "shibby".into(), 1, "job-1".into());
        c.mint_drip(player(), "moon_collar".into(), 1, "job-1".into());
    }

    #[test]
    #[should_panic(expected = "Only the game account")]
    fn only_the_game_account_can_mint() {
        let mut c = setup();
        testing_env!(ctx(accounts(2)).build());
        c.mint_fren(player(), "shibby".into(), 1, "job-1".into());
    }

    #[test]
    #[should_panic(expected = "bound to their owner")]
    fn transfers_always_fail() {
        let mut c = setup();
        c.mint_fren(player(), "shibby".into(), 1, "job-1".into());
        testing_env!(ctx(player()).attached_deposit(near_sdk::NearToken::from_yoctonear(1)).build());
        c.nft_transfer(accounts(3), "fren:shibby:1".into(), None, None);
    }

    #[test]
    #[should_panic(expected = "bound to their owner")]
    fn even_the_game_account_cannot_transfer() {
        let mut c = setup();
        c.mint_fren(player(), "shibby".into(), 1, "job-1".into());
        testing_env!(ctx(accounts(1)).attached_deposit(near_sdk::NearToken::from_yoctonear(1)).build());
        c.nft_transfer(accounts(3), "fren:shibby:1".into(), None, None);
    }

    #[test]
    fn prices_keep_only_the_latest_and_hours_increase() {
        let mut c = setup();
        let q = |bid, ask| vec![Quote { item: "moon_rock".into(), bid, ask }];
        c.post_prices(10, q(1, 3), "p-10".into());
        c.post_prices(11, q(2, 4), "p-11".into());
        let latest = c.latest_prices().unwrap();
        assert_eq!(latest.hour, 11);
        assert_eq!(latest.quotes[0].bid, 2);
    }

    #[test]
    #[should_panic(expected = "hour must increase")]
    fn prices_cannot_go_back_in_time() {
        let mut c = setup();
        let q = vec![Quote { item: "moon_rock".into(), bid: 1, ask: 3 }];
        c.post_prices(11, q.clone(), "p-11".into());
        c.post_prices(10, q, "p-10".into());
    }

    #[test]
    fn a_round_settles_only_with_the_committed_setup() {
        let mut c = setup();
        let setup_text = r#"{"round":"2026-11-14T03","seed":42,"prices":{"moon_rock":2}}"#;
        let h = sha256_hex(setup_text.as_bytes());
        c.commit_round("2026-11-14T03".into(), h.clone(), "c-1".into());
        let results = "a".repeat(64);
        c.settle_round("2026-11-14T03".into(), setup_text.into(), results.clone(), "s-1".into());
        let r = c.round("2026-11-14T03".into()).unwrap();
        assert_eq!(r.setup_hash, h);
        assert_eq!(r.results_hash, Some(results));
        c.mint_trophy(player(), "2026-11-14T03".into(), 1, "t-1".into());
        assert_eq!(c.nft_supply_for_owner(player()), U128(1));
    }

    #[test]
    #[should_panic(expected = "does not match the commitment")]
    fn a_changed_setup_is_rejected() {
        let mut c = setup();
        let h = sha256_hex(b"original");
        c.commit_round("r1".into(), h, "c-1".into());
        c.settle_round("r1".into(), "changed".into(), "b".repeat(64), "s-1".into());
    }

    #[test]
    #[should_panic(expected = "Round is not settled")]
    fn no_trophy_before_settlement() {
        let mut c = setup();
        c.commit_round("r1".into(), sha256_hex(b"x"), "c-1".into());
        c.mint_trophy(player(), "r1".into(), 1, "t-1".into());
    }
}
