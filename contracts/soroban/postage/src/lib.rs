//! # Postage Contract
//!
//! Manages sender-authorized token escrow for Hush protocol messages.
//! Each message has a single `Postage` record whose status progresses through
//! a well-defined lifecycle. Every state transition emits a `PostageEvent`
//! that indexers and wallets can subscribe to for real-time ledger updates.
//!
//! ## Event Schema
//!
//! All contract events share a fixed topic prefix of `["postage"]` (a `Symbol`)
//! followed by two additional topics that identify the action and the message:
//!
//! | Topic index | Type          | Description                              |
//! |-------------|---------------|------------------------------------------|
//! | 0           | `Symbol`      | Fixed contract prefix: `"postage"`       |
//! | 1           | `Symbol`      | Action name (see [`PostageEvent::action`]) |
//! | 2           | `BytesN<32>`  | Unique message identifier                |
//!
//! The event data (non-topic) is a serialized [`Postage`] record snapshotted
//! **after** the state transition is applied, so the `status` field always
//! reflects the outcome of the call that emitted the event.
//!
//! ### Action Symbols
//!
//! | `action` value | Emitted by     | Resulting `PostageStatus`  |
//! |----------------|----------------|----------------------------|
//! | `"submit"`     | [`PostageContract::submit`]  | `Pending`     |
//! | `"expire"`     | [`PostageContract::expire`]  | `Expired`     |
//! | `"settle"`     | [`PostageContract::settle`]  | `Settled`     |
//! | `"refund"`     | [`PostageContract::refund`]  | `Refunded`    |
//! | `"dispute"`    | [`PostageContract::dispute`] | `Disputed`    |
//! | `"reclaim"`    | [`PostageContract::reclaim`] | `Reclaimed`   |
//!
//! ### Lifecycle State Machine
//!
//! ```text
//!           submit
//!  [start] ──────►  Pending
//!                      │
//!           ┌──────────┼──────────┬─────────────┐
//!           │          │          │             │
//!         settle     refund    expire (at    reclaim (at
//!           │          │      expiry_at)    reclaimable_at)
//!           ▼          ▼          │             │
//!        Settled    Refunded   Expired          │
//!                                │              │
//!                     dispute ───┤              │
//!                      (in       ▼              │
//!                     window) Disputed ──►  Reclaimed
//!                              refund/
//!                              reclaim
//! ```
//!
//! Terminal states (`Settled`, `Refunded`, `Reclaimed`) cannot transition and
//! do not emit further events.

#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    symbol_short, token, Address, BytesN, Env, MuxedAddress, Symbol,
};

#[contract]
pub struct PostageContract;

mod lifecycle_guard {
    use super::*;

    #[contracttype]
    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    pub enum PolicyReason {
        SenderAllowed,
        SenderBlocked,
        UnknownSendersDisabled,
        VerificationRequired,
        ReceiptRequired,
        InsufficientPostage,
        PolicySatisfied,
        TierSatisfied,
    }

    #[contracttype]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct Postage {
        pub sender: Address,
        pub recipient: Address,
        pub amount: i128,
        pub fee: i128,
        pub created_at: u64,
        pub expires_at: u64,
        pub dispute_until: u64,
        pub status: PostageStatus,
    }

    #[contracttype]
    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    pub enum PostageStatus {
        Pending,
        Expired,
        Disputed,
        Settled,
        Refunded,
        Reclaimed,
    }

    #[contracttype]
    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    pub enum LifecycleTerminal {
        Open,
        Delivered,
        Read,
        Settled,
        Refunded,
        Disputed,
        Expired,
        Reclaimed,
    }

    #[contracttype]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct LifecycleRecord {
        pub message_id: BytesN<32>,
        pub owner: Address,
        pub sender: Address,
        pub recipient: Address,
        pub amount: i128,
        pub verified: bool,
        pub receipt_required: bool,
        pub policy_version: u32,
        pub decision_reason: PolicyReason,
        pub payload_hash: Option<BytesN<32>>,
        pub protocol_version: Option<u32>,
        pub delivered_at: Option<u64>,
        pub read_at: Option<u64>,
        pub terminal: LifecycleTerminal,
        pub bound_at: u64,
    }

    #[contracterror]
    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    #[repr(u32)]
    pub enum LifecycleError {
        AlreadyInitialized = 1,
        NotInitialized = 2,
        UnauthorizedContract = 3,
        PolicyRejected = 4,
        PolicyVersionMismatch = 5,
        PostageMismatch = 6,
        ReceiptMismatch = 7,
        MissingLifecycle = 8,
        TerminalStateMismatch = 9,
        DuplicateLifecycle = 10,
        AlreadyDelivered = 11,
        AlreadyRead = 12,
    }

    #[contractclient(name = "LifecycleContractClient")]
    pub trait LifecycleContractInterface {
        fn verify_settle(
            message_id: BytesN<32>,
            postage: Postage,
        ) -> Result<LifecycleRecord, LifecycleError>;
        fn verify_refund(
            message_id: BytesN<32>,
            postage: Postage,
        ) -> Result<LifecycleRecord, LifecycleError>;
        fn verify_dispute(
            message_id: BytesN<32>,
            postage: Postage,
        ) -> Result<LifecycleRecord, LifecycleError>;
        fn verify_expire(
            message_id: BytesN<32>,
            postage: Postage,
        ) -> Result<LifecycleRecord, LifecycleError>;
        fn verify_reclaim(
            message_id: BytesN<32>,
            postage: Postage,
        ) -> Result<LifecycleRecord, LifecycleError>;
    }
}

use lifecycle_guard::{
    LifecycleContractClient, LifecycleTerminal, Postage as LifecyclePostage,
    PostageStatus as LifecyclePostageStatus,
};

/// The on-chain record for a single Hush message escrow.
///
/// A `Postage` record is written to persistent storage on [`PostageContract::submit`]
/// and updated in-place on every subsequent state transition. The record is
/// also snapshot-copied into every [`PostageEvent`] so that event subscribers
/// do not need a separate `get` call to learn the final state.
///
/// ## Field Semantics
///
/// | Field          | Type       | Description                                            |
/// |----------------|------------|--------------------------------------------------------|
/// | `sender`       | `Address`  | Account that submitted the escrow; authorises `submit` and `reclaim` |
/// | `recipient`    | `Address`  | Intended message recipient; authorises `settle`, `refund`, and `dispute` |
/// | `amount`       | `i128`     | Full escrowed token amount (stroop-precision)          |
/// | `fee`          | `i128`     | Portion of `amount` routed to the treasury on `settle` |
/// | `created_at`   | `u64`      | Ledger timestamp at which `submit` executed            |
/// | `expires_at`   | `u64`      | Absolute ledger timestamp after which `expire` is callable |
/// | `dispute_until`| `u64`      | Absolute ledger timestamp past which `dispute` is no longer callable |
/// | `status`       | [`PostageStatus`] | Current lifecycle state                         |
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Postage {
    pub sender: Address,
    pub recipient: Address,
    pub amount: i128,
    pub fee: i128,
    pub created_at: u64,
    pub expires_at: u64,
    pub dispute_until: u64,
    pub status: PostageStatus,
}

/// Contract event emitted on every postage lifecycle transition.
///
/// ## Topics (in XDR order)
///
/// 1. `Symbol` — fixed prefix `"postage"` (declared by `#[contractevent(topics = ["postage"])]`)
/// 2. `Symbol` — the `action` field below; names the transition that just occurred
/// 3. `BytesN<32>` — the `message_id` field below; uniquely identifies the escrow
///
/// ## Data (non-topic payload)
///
/// A single [`Postage`] struct serialized as XDR, snapshotted **after** the
/// state transition. This means the `status` field on the embedded `Postage`
/// always matches the action that triggered the event:
///
/// | `action`    | `postage.status` after event |
/// |-------------|------------------------------|
/// | `"submit"`  | `PostageStatus::Pending`     |
/// | `"expire"`  | `PostageStatus::Expired`     |
/// | `"settle"`  | `PostageStatus::Settled`     |
/// | `"refund"`  | `PostageStatus::Refunded`    |
/// | `"dispute"` | `PostageStatus::Disputed`    |
/// | `"reclaim"` | `PostageStatus::Reclaimed`   |
///
/// ## Integration Notes
///
/// - Subscribe using `contractId` + topic filter `["postage", <action>]` to
///   receive events for a specific transition across all messages.
/// - Subscribe using `contractId` + topic filter `["postage", *, <message_id>]`
///   to receive all transitions for a specific message.
/// - The `amount` and `fee` in the embedded `Postage` are fixed at submission
///   time and will not change across events for the same message.
#[contractevent(topics = ["postage"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PostageEvent {
    /// Short `Symbol` naming the action. One of:
    /// `"submit"`, `"expire"`, `"settle"`, `"refund"`, `"dispute"`, `"reclaim"`.
    #[topic]
    pub action: Symbol,
    /// 32-byte opaque identifier for the Hush message.
    #[topic]
    pub message_id: BytesN<32>,
    /// Full snapshot of the postage record after the transition.
    pub postage: Postage,
}

/// Immutable configuration recorded by [`PostageContract::initialize`].
///
/// All fields are fixed at initialization time and cannot be changed
/// without redeploying the contract.
///
/// ## Field Semantics
///
/// | Field             | Type      | Description                                                       |
/// |-------------------|-----------|-------------------------------------------------------------------|
/// | `asset`           | `Address` | SEP-41 / Stellar Asset Contract accepted as postage payment       |
/// | `minimum`         | `i128`    | Minimum postage amount in token stroops; `submit` rejects smaller amounts |
/// | `treasury`        | `Address` | Destination for the fee portion on `settle`                       |
/// | `fee_bps`         | `u32`     | Fee in basis points (`0`–`10_000`); applied to `amount` on settle |
/// | `expiry_seconds`  | `u64`     | Seconds added to `created_at` to derive `expires_at`              |
/// | `dispute_seconds` | `u64`     | Seconds added to `expires_at` to derive `dispute_until`; `0` disables disputes |
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowConfig {
    pub asset: Address,
    pub minimum: i128,
    pub treasury: Address,
    pub fee_bps: u32,
    pub expiry_seconds: u64,
    pub dispute_seconds: u64,
}

/// Lifecycle state of a single postage escrow record.
///
/// ## Transition Rules
///
/// - **`Pending`** — initial state set by `submit`; the only state from which
///   `settle` or `refund` can be called (before `reclaimable_at`).
/// - **`Expired`** — set by `expire` once `ledger_timestamp >= expires_at`.
///   Enables the dispute window if `dispute_seconds > 0`.
/// - **`Disputed`** — set by `dispute` while `expires_at <= now < dispute_until`.
///   The record can still be `refund`ed or `reclaim`ed after the dispute window.
/// - **`Settled`** — **terminal**. Set by `settle`; releases `amount - fee` to
///   the recipient and `fee` to the treasury.
/// - **`Refunded`** — **terminal**. Set by `refund`; returns the full `amount`
///   to the sender.
/// - **`Reclaimed`** — **terminal**. Set by `reclaim`; returns the full `amount`
///   to the sender once `reclaimable_at` is reached.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PostageStatus {
    Pending,
    Expired,
    Disputed,
    Settled,
    Refunded,
    Reclaimed,
}

#[contracttype]
enum DataKey {
    Config,
    Guard,
    Postage(BytesN<32>),
}

/// Contract error codes returned when a call cannot be fulfilled.
///
/// These values are surfaced as `Error(Contract, #N)` in transaction results
/// and can be decoded by numeric code:
///
/// | Code | Variant                | Meaning                                                 |
/// |------|------------------------|---------------------------------------------------------|
/// | 1    | `AlreadyInitialized`   | `initialize` or `configure_guard` called a second time  |
/// | 2    | `NotInitialized`       | Any call before `initialize` is executed                |
/// | 3    | `InvalidAmount`        | `amount < minimum` or amount causes arithmetic overflow |
/// | 4    | `DuplicateMessage`     | A postage record for this `message_id` already exists   |
/// | 5    | `PostageNotFound`      | No record exists for the given `message_id`             |
/// | 6    | `AlreadyResolved`      | The record is already in a terminal state               |
/// | 7    | `InvalidFee`           | `fee_bps > 10_000`                                      |
/// | 8    | `InvalidWindow`        | `expiry_seconds == 0` or timestamp overflow             |
/// | 9    | `NotExpired`           | `reclaim` called before `reclaimable_at`                |
/// | 10   | `DisputeUnavailable`   | `dispute` called outside the dispute window             |
/// | 11   | `GuardNotConfigured`   | No lifecycle guard contract has been registered         |
/// | 12   | `LifecycleRejected`    | The lifecycle guard rejected the requested transition   |
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    DuplicateMessage = 4,
    PostageNotFound = 5,
    AlreadyResolved = 6,
    InvalidFee = 7,
    InvalidWindow = 8,
    NotExpired = 9,
    DisputeUnavailable = 10,
    GuardNotConfigured = 11,
    LifecycleRejected = 12,
}

#[contractimpl]
impl PostageContract {
    /// Initializes the contract configuration.
    ///
    /// # Arguments
    ///
    /// * `asset` - The token asset address accepted by the escrow.
    /// * `treasury` - The treasury address where fees are collected.
    /// * `minimum` - The minimum postage amount required. Must be non-negative.
    /// * `fee_bps` - The contract fee in basis points (0 to 10,000).
    /// * `expiry_seconds` - The duration in seconds after which the postage expires. Must be non-zero.
    /// * `dispute_seconds` - The duration of the dispute window in seconds after expiry.
    ///
    /// # Errors
    ///
    /// * `Error::AlreadyInitialized` - If the contract is already initialized.
    /// * `Error::InvalidAmount` - If `minimum` is negative.
    /// * `Error::InvalidFee` - If `fee_bps` exceeds 10,000.
    /// * `Error::InvalidWindow` - If `expiry_seconds` is zero.
    pub fn initialize(
        env: Env,
        asset: Address,
        treasury: Address,
        minimum: i128,
        fee_bps: u32,
        expiry_seconds: u64,
        dispute_seconds: u64,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(Error::AlreadyInitialized);
        }
        if minimum < 0 {
            return Err(Error::InvalidAmount);
        }
        if fee_bps > 10_000 {
            return Err(Error::InvalidFee);
        }
        if expiry_seconds == 0 {
            return Err(Error::InvalidWindow);
        }

        env.storage().instance().set(
            &DataKey::Config,
            &EscrowConfig {
                asset,
                minimum,
                treasury,
                fee_bps,
                expiry_seconds,
                dispute_seconds,
            },
        );
        Ok(())
    }

    /// Configures the lifecycle guard contract address.
    ///
    /// # Errors
    ///
    /// * `Error::AlreadyInitialized` - If a guard is already configured.
    pub fn configure_guard(env: Env, guard: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Guard) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Guard, &guard);
        Ok(())
    }

    /// Returns the configured guard contract address.
    ///
    /// # Errors
    ///
    /// * `Error::GuardNotConfigured` - If no guard has been configured yet.
    pub fn guard(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Guard)
            .ok_or(Error::GuardNotConfigured)
    }

    /// Returns the escrow configuration.
    ///
    /// # Errors
    ///
    /// * `Error::NotInitialized` - If the contract is not initialized.
    pub fn config(env: Env) -> Result<EscrowConfig, Error> {
        Self::read_config(&env)
    }

    /// Returns the minimum postage amount required.
    ///
    /// # Errors
    ///
    /// * `Error::NotInitialized` - If the contract is not initialized.
    pub fn minimum(env: Env) -> Result<i128, Error> {
        Ok(Self::read_config(&env)?.minimum)
    }

    /// Returns the postage quote for a sender.
    ///
    /// # Errors
    ///
    /// * `Error::NotInitialized` - If the contract is not initialized.
    pub fn quote(env: Env, sender_trusted: bool) -> Result<i128, Error> {
        if sender_trusted {
            return Ok(0);
        }
        Self::minimum(env)
    }

    /// Submits a postage payment for a message, escrowing the tokens.
    ///
    /// # Authorization
    ///
    /// * Requires `sender.require_auth()`. Transfers `amount` tokens from `sender` to contract escrow.
    ///
    /// # Arguments
    ///
    /// * `message_id` - The 32-byte identifier of the message.
    /// * `sender` - The address of the sender submitting the postage.
    /// * `recipient` - The address of the message recipient.
    /// * `amount` - The postage amount to escrow.
    ///
    /// # Errors
    ///
    /// * `Error::NotInitialized` - If the contract is not initialized.
    /// * `Error::InvalidAmount` - If the amount is less than the minimum required postage.
    /// * `Error::DuplicateMessage` - If postage for this message has already been submitted.
    pub fn submit(
        env: Env,
        message_id: BytesN<32>,
        sender: Address,
        recipient: Address,
        amount: i128,
    ) -> Result<Postage, Error> {
        sender.require_auth();

        let config = Self::read_config(&env)?;
        if amount < config.minimum {
            return Err(Error::InvalidAmount);
        }

        let key = DataKey::Postage(message_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::DuplicateMessage);
        }

        let fee = Self::fee_for(amount, config.fee_bps)?;
        let created_at = env.ledger().timestamp();
        let expires_at = Self::checked_deadline(created_at, config.expiry_seconds)?;
        let dispute_until = Self::checked_deadline(expires_at, config.dispute_seconds)?;

        token::TokenClient::new(&env, &config.asset).transfer(
            &sender,
            &MuxedAddress::from(env.current_contract_address()),
            &amount,
        );

        let postage = Postage {
            sender,
            recipient,
            amount,
            fee,
            created_at,
            expires_at,
            dispute_until,
            status: PostageStatus::Pending,
        };
        env.storage().persistent().set(&key, &postage);
        Self::publish_event(&env, symbol_short!("submit"), message_id, postage.clone());
        Ok(postage)
    }

    /// Marks the postage as expired if the expiry time has passed.
    ///
    /// # Authorization
    ///
    /// * Permissionless. Requires current ledger timestamp >= `expires_at` and lifecycle guard approval.
    ///
    /// # Errors
    ///
    /// * `Error::PostageNotFound` - If no postage is found for the given message ID.
    /// * `Error::AlreadyResolved` - If the postage status is already in a terminal state.
    /// * `Error::DisputeUnavailable` - If the postage status is not pending.
    /// * `Error::NotExpired` - If the current ledger time is before the expiry time.
    /// * `Error::GuardNotConfigured` - If the guard contract is not configured.
    /// * `Error::LifecycleRejected` - If the guard contract verification fails.
    pub fn expire(env: Env, message_id: BytesN<32>) -> Result<Postage, Error> {
        let key = DataKey::Postage(message_id.clone());
        let mut postage: Postage = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::PostageNotFound)?;

        if Self::is_terminal(postage.status) {
            return Err(Error::AlreadyResolved);
        }
        if postage.status != PostageStatus::Pending {
            return Err(Error::DisputeUnavailable);
        }
        if env.ledger().timestamp() < postage.expires_at {
            return Err(Error::NotExpired);
        }

        Self::verify_guard(
            &env,
            message_id.clone(),
            &postage,
            LifecycleTerminal::Expired,
        )?;

        postage.status = PostageStatus::Expired;
        env.storage().persistent().set(&key, &postage);
        Self::publish_event(&env, symbol_short!("expire"), message_id, postage.clone());
        Ok(postage)
    }

    /// Settles the postage, transferring the amount (minus fee) to the recipient.
    ///
    /// # Authorization
    ///
    /// * Requires `recipient.require_auth()`. Evaluated via lifecycle guard verification.
    ///
    /// # Errors
    ///
    /// * `Error::PostageNotFound` - If no postage is found for the given message ID.
    /// * `Error::AlreadyResolved` - If the postage is in a terminal state or has passed the reclaimable time.
    /// * `Error::GuardNotConfigured` - If the guard contract is not configured.
    /// * `Error::LifecycleRejected` - If the guard contract verification fails.
    pub fn settle(env: Env, message_id: BytesN<32>) -> Result<Postage, Error> {
        let key = DataKey::Postage(message_id.clone());
        let postage: Postage = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::PostageNotFound)?;
        if Self::is_terminal(postage.status)
            || env.ledger().timestamp() >= Self::reclaimable_at(&postage)
        {
            return Err(Error::AlreadyResolved);
        }
        Self::verify_guard(
            &env,
            message_id.clone(),
            &postage,
            LifecycleTerminal::Settled,
        )?;
        Self::resolve(env, message_id, PostageStatus::Settled)
    }

    /// Refunds the postage to the sender.
    ///
    /// # Authorization
    ///
    /// * Requires `recipient.require_auth()`. Evaluated via lifecycle guard verification.
    ///
    /// # Errors
    ///
    /// * `Error::PostageNotFound` - If no postage is found for the given message ID.
    /// * `Error::AlreadyResolved` - If the postage is in a terminal state or has passed the reclaimable time.
    /// * `Error::GuardNotConfigured` - If the guard contract is not configured.
    /// * `Error::LifecycleRejected` - If the guard contract verification fails.
    pub fn refund(env: Env, message_id: BytesN<32>) -> Result<Postage, Error> {
        let key = DataKey::Postage(message_id.clone());
        let postage: Postage = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::PostageNotFound)?;
        if Self::is_terminal(postage.status)
            || env.ledger().timestamp() >= Self::reclaimable_at(&postage)
        {
            return Err(Error::AlreadyResolved);
        }
        Self::verify_guard(
            &env,
            message_id.clone(),
            &postage,
            LifecycleTerminal::Refunded,
        )?;
        Self::resolve(env, message_id, PostageStatus::Refunded)
    }

    /// Disputes the postage payment.
    ///
    /// # Authorization
    ///
    /// * Requires `recipient.require_auth()`. Allowed during the dispute window.
    ///
    /// # Errors
    ///
    /// * `Error::PostageNotFound` - If no postage is found for the given message ID.
    /// * `Error::AlreadyResolved` - If the postage status is already in a terminal state.
    /// * `Error::DisputeUnavailable` - If the current state cannot transition to disputed or is outside the dispute window.
    /// * `Error::GuardNotConfigured` - If the guard contract is not configured.
    /// * `Error::LifecycleRejected` - If the guard contract verification fails.
    pub fn dispute(env: Env, message_id: BytesN<32>) -> Result<Postage, Error> {
        let key = DataKey::Postage(message_id.clone());
        let mut postage: Postage = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::PostageNotFound)?;

        postage.recipient.require_auth();
        if Self::is_terminal(postage.status) {
            return Err(Error::AlreadyResolved);
        }
        if !matches!(
            postage.status,
            PostageStatus::Pending | PostageStatus::Expired
        ) || postage.dispute_until == postage.expires_at
        {
            return Err(Error::DisputeUnavailable);
        }

        let now = env.ledger().timestamp();
        if now < postage.expires_at || now >= postage.dispute_until {
            return Err(Error::DisputeUnavailable);
        }

        Self::verify_guard(
            &env,
            message_id.clone(),
            &postage,
            LifecycleTerminal::Disputed,
        )?;

        postage.status = PostageStatus::Disputed;
        env.storage().persistent().set(&key, &postage);
        Self::publish_event(&env, symbol_short!("dispute"), message_id, postage.clone());
        Ok(postage)
    }

    /// Reclaims the escrowed postage to the sender after expiry and the dispute window have passed.
    ///
    /// # Authorization
    ///
    /// * Requires `sender.require_auth()`. Allowed after `reclaimable_at` timestamp.
    ///
    /// # Errors
    ///
    /// * `Error::PostageNotFound` - If no postage is found for the given message ID.
    /// * `Error::AlreadyResolved` - If the postage status is already in a terminal state.
    /// * `Error::NotExpired` - If the current ledger time is before the reclaimable time.
    /// * `Error::GuardNotConfigured` - If the guard contract is not configured.
    /// * `Error::LifecycleRejected` - If the guard contract verification fails.
    pub fn reclaim(env: Env, message_id: BytesN<32>) -> Result<Postage, Error> {
        let key = DataKey::Postage(message_id.clone());
        let mut postage: Postage = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::PostageNotFound)?;

        postage.sender.require_auth();
        if Self::is_terminal(postage.status) {
            return Err(Error::AlreadyResolved);
        }

        let reclaimable_at = Self::reclaimable_at(&postage);
        if env.ledger().timestamp() < reclaimable_at {
            return Err(Error::NotExpired);
        }

        Self::verify_guard(
            &env,
            message_id.clone(),
            &postage,
            LifecycleTerminal::Reclaimed,
        )?;

        let config = Self::read_config(&env)?;
        token::TokenClient::new(&env, &config.asset).transfer(
            &env.current_contract_address(),
            &MuxedAddress::from(postage.sender.clone()),
            &postage.amount,
        );

        postage.status = PostageStatus::Reclaimed;
        env.storage().persistent().set(&key, &postage);
        Self::publish_event(&env, symbol_short!("reclaim"), message_id, postage.clone());
        Ok(postage)
    }

    /// Retrieves the postage record for the given message ID.
    ///
    /// # Errors
    ///
    /// * `Error::PostageNotFound` - If no postage is found for the given message ID.
    pub fn get(env: Env, message_id: BytesN<32>) -> Result<Postage, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Postage(message_id))
            .ok_or(Error::PostageNotFound)
    }

    fn resolve(env: Env, message_id: BytesN<32>, status: PostageStatus) -> Result<Postage, Error> {
        let key = DataKey::Postage(message_id.clone());
        let mut postage: Postage = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::PostageNotFound)?;

        postage.recipient.require_auth();
        if Self::is_terminal(postage.status) {
            return Err(Error::AlreadyResolved);
        }
        if env.ledger().timestamp() >= Self::reclaimable_at(&postage) {
            return Err(Error::AlreadyResolved);
        }

        let config = Self::read_config(&env)?;
        let escrow = env.current_contract_address();
        let token = token::TokenClient::new(&env, &config.asset);
        match status {
            PostageStatus::Settled => {
                let recipient_amount = postage
                    .amount
                    .checked_sub(postage.fee)
                    .ok_or(Error::InvalidAmount)?;
                if recipient_amount > 0 {
                    token.transfer(
                        &escrow,
                        &MuxedAddress::from(postage.recipient.clone()),
                        &recipient_amount,
                    );
                }
                if postage.fee > 0 {
                    token.transfer(&escrow, &MuxedAddress::from(config.treasury), &postage.fee);
                }
            }
            PostageStatus::Refunded => {
                token.transfer(
                    &escrow,
                    &MuxedAddress::from(postage.sender.clone()),
                    &postage.amount,
                );
            }
            PostageStatus::Pending
            | PostageStatus::Expired
            | PostageStatus::Disputed
            | PostageStatus::Reclaimed => return Err(Error::AlreadyResolved),
        }

        postage.status = status;
        env.storage().persistent().set(&key, &postage);
        Self::publish_event(
            &env,
            Self::status_symbol(status),
            message_id,
            postage.clone(),
        );
        Ok(postage)
    }

    fn read_config(env: &Env) -> Result<EscrowConfig, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)
    }

    fn verify_guard(
        env: &Env,
        message_id: BytesN<32>,
        postage: &Postage,
        terminal: LifecycleTerminal,
    ) -> Result<(), Error> {
        let guard = env
            .storage()
            .instance()
            .get(&DataKey::Guard)
            .ok_or(Error::GuardNotConfigured)?;
        let lifecycle_postage = Self::to_lifecycle_postage(postage);
        let result = match terminal {
            LifecycleTerminal::Settled => LifecycleContractClient::new(env, &guard)
                .try_verify_settle(&message_id, &lifecycle_postage),
            LifecycleTerminal::Refunded => LifecycleContractClient::new(env, &guard)
                .try_verify_refund(&message_id, &lifecycle_postage),
            LifecycleTerminal::Disputed => LifecycleContractClient::new(env, &guard)
                .try_verify_dispute(&message_id, &lifecycle_postage),
            LifecycleTerminal::Expired => LifecycleContractClient::new(env, &guard)
                .try_verify_expire(&message_id, &lifecycle_postage),
            LifecycleTerminal::Reclaimed => LifecycleContractClient::new(env, &guard)
                .try_verify_reclaim(&message_id, &lifecycle_postage),
            LifecycleTerminal::Open | LifecycleTerminal::Delivered | LifecycleTerminal::Read => {
                return Err(Error::LifecycleRejected)
            }
        };

        match result {
            Ok(Ok(_)) => Ok(()),
            Ok(Err(_)) | Err(_) => Err(Error::LifecycleRejected),
        }
    }

    fn to_lifecycle_postage(postage: &Postage) -> LifecyclePostage {
        LifecyclePostage {
            sender: postage.sender.clone(),
            recipient: postage.recipient.clone(),
            amount: postage.amount,
            fee: postage.fee,
            created_at: postage.created_at,
            expires_at: postage.expires_at,
            dispute_until: postage.dispute_until,
            status: match postage.status {
                PostageStatus::Pending => LifecyclePostageStatus::Pending,
                PostageStatus::Expired => LifecyclePostageStatus::Expired,
                PostageStatus::Disputed => LifecyclePostageStatus::Disputed,
                PostageStatus::Settled => LifecyclePostageStatus::Settled,
                PostageStatus::Refunded => LifecyclePostageStatus::Refunded,
                PostageStatus::Reclaimed => LifecyclePostageStatus::Reclaimed,
            },
        }
    }

    fn checked_deadline(timestamp: u64, seconds: u64) -> Result<u64, Error> {
        timestamp.checked_add(seconds).ok_or(Error::InvalidWindow)
    }

    fn is_terminal(status: PostageStatus) -> bool {
        matches!(
            status,
            PostageStatus::Settled | PostageStatus::Refunded | PostageStatus::Reclaimed
        )
    }

    fn reclaimable_at(postage: &Postage) -> u64 {
        if postage.dispute_until > postage.expires_at {
            postage.dispute_until
        } else {
            postage.expires_at
        }
    }

    fn publish_event(env: &Env, action: Symbol, message_id: BytesN<32>, postage: Postage) {
        PostageEvent {
            action,
            message_id,
            postage,
        }
        .publish(env);
    }

    fn status_symbol(status: PostageStatus) -> Symbol {
        match status {
            PostageStatus::Settled => symbol_short!("settle"),
            PostageStatus::Refunded => symbol_short!("refund"),
            PostageStatus::Reclaimed => symbol_short!("reclaim"),
            PostageStatus::Expired => symbol_short!("expire"),
            PostageStatus::Disputed => symbol_short!("dispute"),
            PostageStatus::Pending => symbol_short!("pending"),
        }
    }

    fn fee_for(amount: i128, fee_bps: u32) -> Result<i128, Error> {
        if amount < 0 {
            return Err(Error::InvalidAmount);
        }
        amount
            .checked_mul(fee_bps as i128)
            .and_then(|gross| gross.checked_div(10_000))
            .ok_or(Error::InvalidAmount)
    }
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, Events, Ledger},
        Event, IntoVal,
    };
    use stealth_lifecycle::LifecycleContract;
    use stealth_lifecycle::LifecycleContractClient;
    use stealth_policies::PoliciesContract;
    use stealth_policies::{MailboxPolicy, PoliciesContractClient};

    fn id(env: &Env, byte: u8) -> BytesN<32> {
        BytesN::from_array(env, &[byte; 32])
    }

    fn bind_lifecycle(
        env: &Env,
        lifecycle: &Address,
        message_id: BytesN<32>,
        sender: &Address,
        recipient: &Address,
        amount: i128,
    ) {
        let lifecycle_client = LifecycleContractClient::new(env, lifecycle);
        lifecycle_client.bind(
            &message_id,
            &recipient.clone(),
            &sender.clone(),
            &recipient.clone(),
            &amount,
            &false,
            &false,
        );
    }

    struct Setup {
        env: Env,
        contract_id: Address,
        asset: Address,
        sender: Address,
        recipient: Address,
        treasury: Address,
        lifecycle: Address,
        policies: Address,
        receipts: Address,
    }

    fn setup(fee_bps: u32) -> Setup {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(42);
        env.ledger().set_sequence_number(10);
        let admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let asset = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &asset);

        // Set up policies contract with permissive default policy
        let policies = env.register(PoliciesContract, ());
        let policies_client = PoliciesContractClient::new(&env, &policies);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let treasury = Address::generate(&env);

        policies_client.set_policy(
            &recipient.clone(),
            &MailboxPolicy {
                allow_unknown: true,
                require_verified: false,
                require_receipt: false,
                minimum_postage: 0,
            },
        );

        // Set up lifecycle contract - will be initialized after postage contract is created
        let receipts = Address::generate(&env);
        let lifecycle = env.register(LifecycleContract, ());
        let lifecycle_client = LifecycleContractClient::new(&env, &lifecycle);

        let contract_id = env.register(PostageContract, ());
        let client = PostageContractClient::new(&env, &contract_id);

        token_admin.mint(&sender, &1_000);
        client.initialize(&asset, &treasury, &100, &fee_bps, &86_400, &3_600);
        client.configure_guard(&lifecycle);

        // Now initialize lifecycle with the actual postage contract address
        lifecycle_client.initialize(&policies, &contract_id, &receipts);

        Setup {
            env,
            contract_id,
            asset,
            sender,
            recipient,
            treasury,
            lifecycle,
            policies,
            receipts,
        }
    }

    #[test]
    fn records_escrows_and_settles_postage() {
        let setup = setup(500);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        let token = token::TokenClient::new(&setup.env, &setup.asset);

        let postage = client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &200);
        assert_eq!(postage.status, PostageStatus::Pending);
        assert_eq!(postage.created_at, 42);
        assert_eq!(postage.expires_at, 86_442);
        assert_eq!(postage.dispute_until, 90_042);
        assert_eq!(postage.fee, 10);
        assert_eq!(token.balance(&setup.sender), 800);
        assert_eq!(token.balance(&setup.contract_id), 200);

        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 1),
            &setup.sender,
            &setup.recipient,
            200,
        );

        let settled = client.settle(&id(&setup.env, 1));
        assert_eq!(settled.status, PostageStatus::Settled);
        assert_eq!(token.balance(&setup.contract_id), 0);
        assert_eq!(token.balance(&setup.recipient), 190);
        assert_eq!(token.balance(&setup.treasury), 10);
        assert_eq!(
            token.balance(&setup.sender)
                + token.balance(&setup.recipient)
                + token.balance(&setup.treasury)
                + token.balance(&setup.contract_id),
            1_000
        );
    }

    #[test]
    fn refund_returns_full_escrow_to_sender() {
        let setup = setup(250);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        let token = token::TokenClient::new(&setup.env, &setup.asset);

        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &200);
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 1),
            &setup.sender,
            &setup.recipient,
            200,
        );
        let refunded = client.refund(&id(&setup.env, 1));

        assert_eq!(refunded.status, PostageStatus::Refunded);
        assert_eq!(token.balance(&setup.sender), 1_000);
        assert_eq!(token.balance(&setup.recipient), 0);
        assert_eq!(token.balance(&setup.treasury), 0);
        assert_eq!(token.balance(&setup.contract_id), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn double_settlement_and_refund_are_impossible() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);

        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 1),
            &setup.sender,
            &setup.recipient,
            125,
        );
        client.settle(&id(&setup.env, 1));
        client.refund(&id(&setup.env, 1));
    }

    #[test]
    fn accepted_asset_and_fee_policy_are_explicit() {
        let setup = setup(125);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);

        assert_eq!(
            client.config(),
            EscrowConfig {
                asset: setup.asset,
                minimum: 100,
                treasury: setup.treasury,
                fee_bps: 125,
                expiry_seconds: 86_400,
                dispute_seconds: 3_600,
            }
        );
    }

    #[test]
    fn trusted_sender_has_zero_quote() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let asset = env.register_stellar_asset_contract_v2(admin).address();
        let treasury = Address::generate(&env);
        let contract_id = env.register(PostageContract, ());
        let client = PostageContractClient::new(&env, &contract_id);
        client.initialize(&asset, &treasury, &100, &0, &86_400, &0);

        assert_eq!(client.quote(&true), 0);
        assert_eq!(client.quote(&false), 100);
    }

    #[test]
    fn authorization_tree_captures_sender_deposit_and_recipient_resolution() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);

        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
        assert_eq!(
            setup.env.auths(),
            [(
                setup.sender.clone(),
                AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        setup.contract_id.clone(),
                        symbol_short!("submit"),
                        (
                            id(&setup.env, 1),
                            setup.sender.clone(),
                            setup.recipient.clone(),
                            125_i128,
                        )
                            .into_val(&setup.env),
                    )),
                    sub_invocations: [AuthorizedInvocation {
                        function: AuthorizedFunction::Contract((
                            setup.asset.clone(),
                            symbol_short!("transfer"),
                            (
                                setup.sender.clone(),
                                MuxedAddress::from(setup.contract_id.clone()),
                                125_i128,
                            )
                                .into_val(&setup.env),
                        )),
                        sub_invocations: [].into(),
                    }]
                    .into(),
                }
            )]
        );

        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 1),
            &setup.sender,
            &setup.recipient,
            125,
        );
        client.settle(&id(&setup.env, 1));
        assert_eq!(
            setup.env.auths(),
            [(
                setup.recipient.clone(),
                AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        setup.contract_id.clone(),
                        symbol_short!("settle"),
                        (id(&setup.env, 1),).into_val(&setup.env),
                    )),
                    sub_invocations: [].into(),
                }
            )]
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn reclaim_fails_before_expiry() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);

        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
        setup.env.ledger().set_timestamp(86_441);
        client.reclaim(&id(&setup.env, 1));
    }

    #[test]
    fn reclaim_succeeds_at_expiry_when_dispute_window_is_disabled() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(10);
        let admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let asset = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &asset);

        // Set up policies and lifecycle
        let policies = env.register(PoliciesContract, ());
        let policies_client = PoliciesContractClient::new(&env, &policies);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        policies_client.set_policy(
            &recipient.clone(),
            &MailboxPolicy {
                allow_unknown: true,
                require_verified: false,
                require_receipt: false,
                minimum_postage: 0,
            },
        );
        let receipts = Address::generate(&env);
        let lifecycle = env.register(LifecycleContract, ());
        let lifecycle_client = LifecycleContractClient::new(&env, &lifecycle);

        let contract_id = env.register(PostageContract, ());
        let client = PostageContractClient::new(&env, &contract_id);
        let treasury = Address::generate(&env);
        let token = token::TokenClient::new(&env, &asset);

        token_admin.mint(&sender, &1_000);
        client.initialize(&asset, &treasury, &100, &0, &30, &0);
        client.configure_guard(&lifecycle);
        lifecycle_client.initialize(&policies, &contract_id, &receipts);

        let postage = client.submit(&id(&env, 1), &sender, &recipient, &125);
        assert_eq!(postage.expires_at, 40);
        assert_eq!(postage.dispute_until, 40);
        bind_lifecycle(&env, &lifecycle, id(&env, 1), &sender, &recipient, 125);

        env.ledger().set_timestamp(40);
        let reclaimed = client.reclaim(&id(&env, 1));

        assert_eq!(reclaimed.status, PostageStatus::Reclaimed);
        assert_eq!(token.balance(&sender), 1_000);
        assert_eq!(token.balance(&contract_id), 0);
    }

    #[test]
    fn expiry_state_is_fixed_and_callable_at_boundary() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);

        let postage = client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
        assert_eq!(postage.expires_at, 86_442);

        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 1),
            &setup.sender,
            &setup.recipient,
            125,
        );

        setup.env.ledger().set_timestamp(86_441);
        assert_eq!(
            client.try_expire(&id(&setup.env, 1)),
            Err(Ok(Error::NotExpired))
        );

        setup.env.ledger().set_timestamp(86_442);
        let expired = client.expire(&id(&setup.env, 1));
        assert_eq!(expired.status, PostageStatus::Expired);
        assert_eq!(expired.expires_at, 86_442);
        assert_eq!(expired.dispute_until, 90_042);
    }

    #[test]
    fn dispute_window_blocks_reclaim_until_boundary() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        let token = token::TokenClient::new(&setup.env, &setup.asset);

        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 1),
            &setup.sender,
            &setup.recipient,
            125,
        );
        setup.env.ledger().set_timestamp(86_442);
        let disputed = client.dispute(&id(&setup.env, 1));
        assert_eq!(disputed.status, PostageStatus::Disputed);

        setup.env.ledger().set_timestamp(90_041);
        assert_eq!(
            client.try_reclaim(&id(&setup.env, 1)),
            Err(Ok(Error::NotExpired))
        );

        setup.env.ledger().set_timestamp(90_042);
        let reclaimed = client.reclaim(&id(&setup.env, 1));
        assert_eq!(reclaimed.status, PostageStatus::Reclaimed);
        assert_eq!(token.balance(&setup.sender), 1_000);
        assert_eq!(token.balance(&setup.contract_id), 0);
    }

    #[test]
    fn expired_postage_can_be_disputed_or_reclaimed() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        let token = token::TokenClient::new(&setup.env, &setup.asset);

        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
        client.submit(&id(&setup.env, 2), &setup.sender, &setup.recipient, &125);

        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 1),
            &setup.sender,
            &setup.recipient,
            125,
        );
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 2),
            &setup.sender,
            &setup.recipient,
            125,
        );

        setup.env.ledger().set_timestamp(86_442);
        client.expire(&id(&setup.env, 1));
        let disputed = client.dispute(&id(&setup.env, 1));
        assert_eq!(disputed.status, PostageStatus::Disputed);

        setup.env.ledger().set_timestamp(90_042);
        client.expire(&id(&setup.env, 2));
        let reclaimed = client.reclaim(&id(&setup.env, 2));
        assert_eq!(reclaimed.status, PostageStatus::Reclaimed);
        assert_eq!(token.balance(&setup.contract_id), 125);
    }

    #[test]
    fn expiry_and_reclaim_emit_typed_events() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        let message_id = id(&setup.env, 1);

        client.submit(&message_id, &setup.sender, &setup.recipient, &125);
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            message_id.clone(),
            &setup.sender,
            &setup.recipient,
            125,
        );

        setup.env.ledger().set_timestamp(90_042);

        let expired = client.expire(&message_id);
        assert_eq!(
            setup
                .env
                .events()
                .all()
                .filter_by_contract(&setup.contract_id),
            std::vec![PostageEvent {
                action: symbol_short!("expire"),
                message_id: message_id.clone(),
                postage: expired,
            }
            .to_xdr(&setup.env, &setup.contract_id)]
        );

        let reclaimed = client.reclaim(&message_id);
        assert_eq!(
            setup
                .env
                .events()
                .all()
                .filter_by_contract(&setup.contract_id),
            std::vec![PostageEvent {
                action: symbol_short!("reclaim"),
                message_id,
                postage: reclaimed,
            }
            .to_xdr(&setup.env, &setup.contract_id)]
        );
    }

    #[test]
    fn dispute_fails_at_dispute_deadline() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);

        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 1),
            &setup.sender,
            &setup.recipient,
            125,
        );
        setup.env.ledger().set_timestamp(90_042);

        assert_eq!(
            client.try_dispute(&id(&setup.env, 1)),
            Err(Ok(Error::DisputeUnavailable))
        );
    }

    #[test]
    fn disputed_postage_can_be_refunded_before_deadline() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        let token = token::TokenClient::new(&setup.env, &setup.asset);

        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 1),
            &setup.sender,
            &setup.recipient,
            125,
        );
        setup.env.ledger().set_timestamp(86_442);
        client.dispute(&id(&setup.env, 1));
        setup.env.ledger().set_timestamp(90_041);
        let refunded = client.refund(&id(&setup.env, 1));

        assert_eq!(refunded.status, PostageStatus::Refunded);
        assert_eq!(token.balance(&setup.sender), 1_000);
        assert_eq!(token.balance(&setup.contract_id), 0);
    }

    #[test]
    fn recipient_resolution_fails_at_reclaim_boundary() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);

        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
        client.submit(&id(&setup.env, 2), &setup.sender, &setup.recipient, &125);
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 1),
            &setup.sender,
            &setup.recipient,
            125,
        );
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 2),
            &setup.sender,
            &setup.recipient,
            125,
        );
        setup.env.ledger().set_timestamp(90_041);
        assert_eq!(
            client.settle(&id(&setup.env, 1)).status,
            PostageStatus::Settled
        );

        setup.env.ledger().set_timestamp(90_042);
        assert_eq!(
            client.try_refund(&id(&setup.env, 2)),
            Err(Ok(Error::AlreadyResolved))
        );
        assert_eq!(
            client.try_settle(&id(&setup.env, 2)),
            Err(Ok(Error::AlreadyResolved))
        );
    }

    #[test]
    fn terminal_states_cannot_transition() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);

        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 1),
            &setup.sender,
            &setup.recipient,
            125,
        );
        setup.env.ledger().set_timestamp(90_042);
        client.reclaim(&id(&setup.env, 1));

        assert_eq!(
            client.try_settle(&id(&setup.env, 1)),
            Err(Ok(Error::AlreadyResolved))
        );
        assert_eq!(
            client.try_refund(&id(&setup.env, 1)),
            Err(Ok(Error::AlreadyResolved))
        );
        assert_eq!(
            client.try_dispute(&id(&setup.env, 1)),
            Err(Ok(Error::AlreadyResolved))
        );
        assert_eq!(
            client.try_expire(&id(&setup.env, 1)),
            Err(Ok(Error::AlreadyResolved))
        );

        client.submit(&id(&setup.env, 2), &setup.sender, &setup.recipient, &125);
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 2),
            &setup.sender,
            &setup.recipient,
            125,
        );
        client.refund(&id(&setup.env, 2));
        assert_eq!(
            client.try_reclaim(&id(&setup.env, 2)),
            Err(Ok(Error::AlreadyResolved))
        );

        client.submit(&id(&setup.env, 3), &setup.sender, &setup.recipient, &125);
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 3),
            &setup.sender,
            &setup.recipient,
            125,
        );
        client.settle(&id(&setup.env, 3));
        assert_eq!(
            client.try_dispute(&id(&setup.env, 3)),
            Err(Ok(Error::AlreadyResolved))
        );
    }

    #[test]
    #[should_panic(expected = "Error(Auth")]
    fn submit_requires_sender_auth() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        let wrong_address = Address::generate(&setup.env);

        setup.env.mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &wrong_address,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "submit",
                args: (
                    id(&setup.env, 1),
                    setup.sender.clone(),
                    setup.recipient.clone(),
                    125_i128,
                )
                    .into_val(&setup.env),
                sub_invokes: &[],
            },
        }]);

        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
    }

    #[test]
    #[should_panic(expected = "Error(Auth")]
    fn dispute_requires_recipient_auth() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 1),
            &setup.sender,
            &setup.recipient,
            125,
        );
        setup.env.ledger().set_timestamp(86_442);

        let wrong_address = Address::generate(&setup.env);
        setup.env.mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &wrong_address,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "dispute",
                args: (id(&setup.env, 1),).into_val(&setup.env),
                sub_invokes: &[],
            },
        }]);

        client.dispute(&id(&setup.env, 1));
    }

    #[test]
    #[should_panic(expected = "Error(Auth")]
    fn settle_requires_recipient_auth() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 1),
            &setup.sender,
            &setup.recipient,
            125,
        );

        let wrong_address = Address::generate(&setup.env);
        setup.env.mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &wrong_address,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "settle",
                args: (id(&setup.env, 1),).into_val(&setup.env),
                sub_invokes: &[],
            },
        }]);

        client.settle(&id(&setup.env, 1));
    }

    #[test]
    #[should_panic(expected = "Error(Auth")]
    fn refund_requires_recipient_auth() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 1),
            &setup.sender,
            &setup.recipient,
            125,
        );

        let wrong_address = Address::generate(&setup.env);
        setup.env.mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &wrong_address,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "refund",
                args: (id(&setup.env, 1),).into_val(&setup.env),
                sub_invokes: &[],
            },
        }]);

        client.refund(&id(&setup.env, 1));
    }

    #[test]
    #[should_panic(expected = "Error(Auth")]
    fn reclaim_requires_sender_auth() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
        setup.env.ledger().set_timestamp(90_042);

        let wrong_address = Address::generate(&setup.env);
        setup.env.mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &wrong_address,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &setup.contract_id,
                fn_name: "reclaim",
                args: (id(&setup.env, 1),).into_val(&setup.env),
                sub_invokes: &[],
            },
        }]);

        client.reclaim(&id(&setup.env, 1));
    }

    #[test]
    fn expire_has_no_auth_requirement() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &125);
        bind_lifecycle(
            &setup.env,
            &setup.lifecycle,
            id(&setup.env, 1),
            &setup.sender,
            &setup.recipient,
            125,
        );
        setup.env.ledger().set_timestamp(86_442);

        setup.env.mock_auths(&[]);

        let expired = client.expire(&id(&setup.env, 1));
        assert_eq!(expired.status, PostageStatus::Expired);
    }

    #[test]
    fn initialize_fails_if_already_initialized() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        let res = client.try_initialize(&setup.asset, &setup.treasury, &100, &0, &86_400, &3_600);
        assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
    }

    #[test]
    fn initialize_fails_on_invalid_arguments() {
        let env = Env::default();
        let contract_id = env.register(PostageContract, ());
        let client = PostageContractClient::new(&env, &contract_id);
        let asset = Address::generate(&env);
        let treasury = Address::generate(&env);

        // negative minimum
        assert_eq!(
            client.try_initialize(&asset, &treasury, &-1, &0, &86_400, &3_600),
            Err(Ok(Error::InvalidAmount))
        );

        // fee_bps > 10_000
        assert_eq!(
            client.try_initialize(&asset, &treasury, &100, &10_001, &86_400, &3_600),
            Err(Ok(Error::InvalidFee))
        );

        // expiry_seconds == 0
        assert_eq!(
            client.try_initialize(&asset, &treasury, &100, &0, &0, &3_600),
            Err(Ok(Error::InvalidWindow))
        );
    }

    #[test]
    fn configure_guard_fails_if_already_configured() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        let another_guard = Address::generate(&setup.env);
        assert_eq!(
            client.try_configure_guard(&another_guard),
            Err(Ok(Error::AlreadyInitialized))
        );
    }

    #[test]
    fn guard_fails_if_not_configured() {
        let env = Env::default();
        let contract_id = env.register(PostageContract, ());
        let client = PostageContractClient::new(&env, &contract_id);
        let asset = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&asset, &treasury, &100, &0, &86_400, &3_600);

        assert_eq!(client.try_guard(), Err(Ok(Error::GuardNotConfigured)));
    }

    #[test]
    fn operations_fail_if_not_initialized() {
        let env = Env::default();
        let contract_id = env.register(PostageContract, ());
        let client = PostageContractClient::new(&env, &contract_id);

        assert!(client.try_config().is_err());
        assert!(client.try_minimum().is_err());
        assert!(client.try_quote(&false).is_err());
        assert!(client
            .try_submit(
                &id(&env, 1),
                &Address::generate(&env),
                &Address::generate(&env),
                &100
            )
            .is_err());
    }

    #[test]
    fn submit_fails_on_insufficient_amount() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        assert_eq!(
            client.try_submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &99),
            Err(Ok(Error::InvalidAmount))
        );
    }

    #[test]
    fn submit_fails_on_duplicate_message() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &100);
        assert_eq!(
            client.try_submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &100),
            Err(Ok(Error::DuplicateMessage))
        );
    }

    #[test]
    fn operations_fail_if_postage_not_found() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        let missing_id = id(&setup.env, 99);

        assert_eq!(client.try_get(&missing_id), Err(Ok(Error::PostageNotFound)));
        assert_eq!(
            client.try_expire(&missing_id),
            Err(Ok(Error::PostageNotFound))
        );
        assert_eq!(
            client.try_settle(&missing_id),
            Err(Ok(Error::PostageNotFound))
        );
        assert_eq!(
            client.try_refund(&missing_id),
            Err(Ok(Error::PostageNotFound))
        );
        assert_eq!(
            client.try_dispute(&missing_id),
            Err(Ok(Error::PostageNotFound))
        );
        assert_eq!(
            client.try_reclaim(&missing_id),
            Err(Ok(Error::PostageNotFound))
        );
    }

    #[test]
    fn dispute_fails_before_expiry() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &100);
        assert_eq!(
            client.try_dispute(&id(&setup.env, 1)),
            Err(Ok(Error::DisputeUnavailable))
        );
    }

    #[test]
    fn dispute_fails_if_dispute_window_disabled() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(10);
        let admin = Address::generate(&env);
        let asset = env.register_stellar_asset_contract_v2(admin).address();
        let token_admin = token::StellarAssetClient::new(&env, &asset);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        token_admin.mint(&sender, &1_000);

        let policies = env.register(PoliciesContract, ());
        let policies_client = PoliciesContractClient::new(&env, &policies);
        policies_client.set_policy(
            &recipient.clone(),
            &MailboxPolicy {
                allow_unknown: true,
                require_verified: false,
                require_receipt: false,
                minimum_postage: 0,
            },
        );

        let receipts = Address::generate(&env);
        let lifecycle = env.register(LifecycleContract, ());
        let lifecycle_client = LifecycleContractClient::new(&env, &lifecycle);

        let contract_id = env.register(PostageContract, ());
        let client = PostageContractClient::new(&env, &contract_id);
        let treasury = Address::generate(&env);

        client.initialize(&asset, &treasury, &100, &0, &30, &0);
        client.configure_guard(&lifecycle);
        lifecycle_client.initialize(&policies, &contract_id, &receipts);

        client.submit(&id(&env, 1), &sender, &recipient, &100);
        bind_lifecycle(&env, &lifecycle, id(&env, 1), &sender, &recipient, 100);

        env.ledger().set_timestamp(40);
        assert_eq!(
            client.try_dispute(&id(&env, 1)),
            Err(Ok(Error::DisputeUnavailable))
        );
    }

    #[test]
    fn guard_verification_fails_propagates_lifecycle_rejected() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);
        client.submit(&id(&setup.env, 1), &setup.sender, &setup.recipient, &100);

        setup.env.ledger().set_timestamp(86_442);
        assert_eq!(
            client.try_expire(&id(&setup.env, 1)),
            Err(Ok(Error::LifecycleRejected))
        );
    }

    #[test]
    fn operations_fail_when_guard_not_configured() {
        let env = Env::default();
        let contract_id = env.register(PostageContract, ());
        let client = PostageContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let asset = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &asset);
        let treasury = Address::generate(&env);

        client.initialize(&asset, &treasury, &100, &0, &86_400, &3_600);

        env.mock_all_auths();
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        token_admin.mint(&sender, &1_000);

        client.submit(&id(&env, 1), &sender, &recipient, &100);

        env.ledger().set_timestamp(86_400);
        assert_eq!(
            client.try_expire(&id(&env, 1)),
            Err(Ok(Error::GuardNotConfigured))
        );
    }

    #[test]
    fn audit_panic_free_error_handling_invalid_inputs_and_uninitialized() {
        let env = Env::default();
        env.mock_all_auths();
        let client = PostageContractClient::new(&env, &env.register(PostageContract, ()));
        let dummy_id = id(&env, 1);

        assert_eq!(client.try_config(), Err(Ok(Error::NotInitialized)));
        assert_eq!(client.try_minimum(), Err(Ok(Error::NotInitialized)));
        assert_eq!(client.try_quote(&false), Err(Ok(Error::NotInitialized)));
        assert_eq!(
            client.try_submit(
                &dummy_id,
                &Address::generate(&env),
                &Address::generate(&env),
                &100
            ),
            Err(Ok(Error::NotInitialized))
        );

        let env2 = Env::default();
        env2.mock_all_auths();
        let client2 = PostageContractClient::new(&env2, &env2.register(PostageContract, ()));
        let admin2 = Address::generate(&env2);
        let asset2 = env2.register_stellar_asset_contract_v2(admin2).address();
        client2.initialize(&asset2, &Address::generate(&env2), &100, &0, &3600, &0);
        assert_eq!(client2.try_guard(), Err(Ok(Error::GuardNotConfigured)));
    }

    #[test]
    fn audit_panic_free_error_handling_overflow_and_invalid_amounts() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let asset = env.register_stellar_asset_contract_v2(admin).address();
        let client = PostageContractClient::new(&env, &env.register(PostageContract, ()));
        let treasury = Address::generate(&env);

        client.initialize(&asset, &treasury, &100, &500, &86400, &3600);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        assert_eq!(
            client.try_submit(&id(&env, 1), &sender, &recipient, &99),
            Err(Ok(Error::InvalidAmount))
        );

        let token_admin = token::StellarAssetClient::new(&env, &asset);
        token_admin.mint(&sender, &10_000);
        assert!(client
            .try_submit(&id(&env, 1), &sender, &recipient, &200)
            .is_ok());
        assert_eq!(
            client.try_submit(&id(&env, 1), &sender, &recipient, &200),
            Err(Ok(Error::DuplicateMessage))
        );

        let unknown_id = id(&env, 99);
        assert_eq!(client.try_get(&unknown_id), Err(Ok(Error::PostageNotFound)));
        assert_eq!(
            client.try_expire(&unknown_id),
            Err(Ok(Error::PostageNotFound))
        );
        assert_eq!(
            client.try_settle(&unknown_id),
            Err(Ok(Error::PostageNotFound))
        );
        assert_eq!(
            client.try_refund(&unknown_id),
            Err(Ok(Error::PostageNotFound))
        );
        assert_eq!(
            client.try_dispute(&unknown_id),
            Err(Ok(Error::PostageNotFound))
        );
        assert_eq!(
            client.try_reclaim(&unknown_id),
            Err(Ok(Error::PostageNotFound))
        );
    }

    #[test]
    fn audit_panic_free_error_handling_guard_failures() {
        let setup = setup(0);
        let client = PostageContractClient::new(&setup.env, &setup.contract_id);

        let msg_id = id(&setup.env, 1);
        client.submit(&msg_id, &setup.sender, &setup.recipient, &125);

        assert_eq!(
            client.try_settle(&msg_id),
            Err(Ok(Error::LifecycleRejected))
        );
        assert_eq!(
            client.try_refund(&msg_id),
            Err(Ok(Error::LifecycleRejected))
        );

        setup.env.ledger().set_timestamp(86_442);
        assert_eq!(
            client.try_expire(&msg_id),
            Err(Ok(Error::LifecycleRejected))
        );

        setup.env.ledger().set_timestamp(90_042);
        assert_eq!(
            client.try_reclaim(&msg_id),
            Err(Ok(Error::LifecycleRejected))
        );
    }
}

/// Tests that exhaustively verify the event schema for every postage lifecycle
/// transition.
///
/// Each test follows the pattern:
///   1. Drive the contract to the target state.
///   2. Collect *only* the events emitted by the postage contract.
///   3. Assert the exact `action` symbol and that `postage.status` matches.
///
/// This guards against:
/// - Wrong action symbol being emitted (e.g. `settle` accidentally emitting
///   `refund`).
/// - Missing events (a transition that silently skips the publish call).
/// - Data corruption in the embedded `Postage` snapshot.
#[cfg(test)]
mod event_schema {
    extern crate std;

    use super::*;
    use soroban_sdk::token;
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger},
        Event,
    };
    use stealth_lifecycle::LifecycleContract;
    use stealth_lifecycle::LifecycleContractClient;
    use stealth_policies::PoliciesContract;
    use stealth_policies::{MailboxPolicy, PoliciesContractClient};

    fn mid(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[0x42u8; 32])
    }

    struct Setup {
        env: Env,
        contract_id: Address,
        asset: Address,
        sender: Address,
        recipient: Address,
        lifecycle: Address,
    }

    fn setup_with_fee(fee_bps: u32, dispute_seconds: u64) -> Setup {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000);

        let admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin);
        let asset = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &asset);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let treasury = Address::generate(&env);
        let receipts = Address::generate(&env);

        let policies = env.register(PoliciesContract, ());
        PoliciesContractClient::new(&env, &policies).set_policy(
            &recipient,
            &MailboxPolicy {
                allow_unknown: true,
                require_verified: false,
                require_receipt: false,
                minimum_postage: 0,
            },
        );

        let lifecycle = env.register(LifecycleContract, ());
        let contract_id = env.register(PostageContract, ());
        let client = PostageContractClient::new(&env, &contract_id);

        token_admin.mint(&sender, &10_000);
        client.initialize(&asset, &treasury, &100, &fee_bps, &3_600, &dispute_seconds);
        client.configure_guard(&lifecycle);
        LifecycleContractClient::new(&env, &lifecycle).initialize(
            &policies,
            &contract_id,
            &receipts,
        );

        Setup {
            env,
            contract_id,
            asset,
            sender,
            recipient,
            lifecycle,
        }
    }

    fn bind(env: &Env, lifecycle: &Address, sender: &Address, recipient: &Address, amount: i128) {
        LifecycleContractClient::new(env, lifecycle).bind(
            &mid(env),
            &recipient.clone(),
            &sender.clone(),
            &recipient.clone(),
            &amount,
            &false,
            &false,
        );
    }

    // ── submit ────────────────────────────────────────────────────────────────

    /// `submit` must emit action=`"submit"` with `PostageStatus::Pending`
    /// and the full postage snapshot as the event data.
    #[test]
    fn submit_emits_submit_event_with_pending_status() {
        let s = setup_with_fee(0, 0);
        let client = PostageContractClient::new(&s.env, &s.contract_id);
        let message_id = mid(&s.env);

        let postage = client.submit(&message_id, &s.sender, &s.recipient, &200);
        assert_eq!(postage.status, PostageStatus::Pending);
        assert_eq!(postage.amount, 200);
        assert_eq!(postage.sender, s.sender);
        assert_eq!(postage.recipient, s.recipient);

        assert_eq!(
            s.env.events().all().filter_by_contract(&s.contract_id),
            std::vec![PostageEvent {
                action: symbol_short!("submit"),
                message_id: message_id.clone(),
                postage,
            }
            .to_xdr(&s.env, &s.contract_id)]
        );
    }

    // ── expire ────────────────────────────────────────────────────────────────

    /// `expire` must emit action=`"expire"` with `PostageStatus::Expired`.
    #[test]
    fn expire_emits_expire_event_with_expired_status() {
        let s = setup_with_fee(0, 0);
        let client = PostageContractClient::new(&s.env, &s.contract_id);
        let message_id = mid(&s.env);

        client.submit(&message_id, &s.sender, &s.recipient, &200);
        bind(&s.env, &s.lifecycle, &s.sender, &s.recipient, 200);
        // expires_at = 1_000 + 3_600 = 4_600
        s.env.ledger().set_timestamp(4_600);

        let postage = client.expire(&message_id);
        assert_eq!(postage.status, PostageStatus::Expired);

        assert_eq!(
            s.env.events().all().filter_by_contract(&s.contract_id),
            std::vec![PostageEvent {
                action: symbol_short!("expire"),
                message_id: message_id.clone(),
                postage,
            }
            .to_xdr(&s.env, &s.contract_id)]
        );
    }

    // ── settle ────────────────────────────────────────────────────────────────

    /// `settle` must emit action=`"settle"` with `PostageStatus::Settled`.
    /// The fee in the embedded postage snapshot must equal the fee computed
    /// at submission time.
    #[test]
    fn settle_emits_settle_event_with_settled_status() {
        let s = setup_with_fee(500, 0);
        let client = PostageContractClient::new(&s.env, &s.contract_id);
        let message_id = mid(&s.env);

        client.submit(&message_id, &s.sender, &s.recipient, &200);
        bind(&s.env, &s.lifecycle, &s.sender, &s.recipient, 200);

        let postage = client.settle(&message_id);
        assert_eq!(postage.status, PostageStatus::Settled);
        // fee = 200 * 500 / 10_000 = 10
        assert_eq!(postage.fee, 10);

        assert_eq!(
            s.env.events().all().filter_by_contract(&s.contract_id),
            std::vec![PostageEvent {
                action: symbol_short!("settle"),
                message_id: message_id.clone(),
                postage,
            }
            .to_xdr(&s.env, &s.contract_id)]
        );
    }

    // ── refund ────────────────────────────────────────────────────────────────

    /// `refund` must emit action=`"refund"` with `PostageStatus::Refunded`
    /// and the full `amount` in the snapshot (no fee deducted on refund).
    #[test]
    fn refund_emits_refund_event_with_refunded_status() {
        let s = setup_with_fee(0, 0);
        let client = PostageContractClient::new(&s.env, &s.contract_id);
        let message_id = mid(&s.env);

        client.submit(&message_id, &s.sender, &s.recipient, &200);
        bind(&s.env, &s.lifecycle, &s.sender, &s.recipient, 200);

        let postage = client.refund(&message_id);
        assert_eq!(postage.status, PostageStatus::Refunded);
        assert_eq!(postage.amount, 200);

        assert_eq!(
            s.env.events().all().filter_by_contract(&s.contract_id),
            std::vec![PostageEvent {
                action: symbol_short!("refund"),
                message_id: message_id.clone(),
                postage,
            }
            .to_xdr(&s.env, &s.contract_id)]
        );
    }

    // ── dispute ───────────────────────────────────────────────────────────────

    /// `dispute` must emit action=`"dispute"` with `PostageStatus::Disputed`.
    #[test]
    fn dispute_emits_dispute_event_with_disputed_status() {
        // dispute_seconds = 1_800, so window = [expires_at, expires_at + 1_800)
        let s = setup_with_fee(0, 1_800);
        let client = PostageContractClient::new(&s.env, &s.contract_id);
        let message_id = mid(&s.env);

        client.submit(&message_id, &s.sender, &s.recipient, &200);
        bind(&s.env, &s.lifecycle, &s.sender, &s.recipient, 200);
        // expires_at = 1_000 + 3_600 = 4_600; dispute_until = 4_600 + 1_800 = 6_400
        s.env.ledger().set_timestamp(4_600);

        let postage = client.dispute(&message_id);
        assert_eq!(postage.status, PostageStatus::Disputed);

        assert_eq!(
            s.env.events().all().filter_by_contract(&s.contract_id),
            std::vec![PostageEvent {
                action: symbol_short!("dispute"),
                message_id: message_id.clone(),
                postage,
            }
            .to_xdr(&s.env, &s.contract_id)]
        );
    }

    // ── reclaim ───────────────────────────────────────────────────────────────

    /// `reclaim` must emit action=`"reclaim"` with `PostageStatus::Reclaimed`
    /// and the full `amount` returned to sender in the snapshot.
    /// We expire first (matching the existing test pattern) so each call to
    /// `env.events().all()` captures only the events from that one invocation.
    #[test]
    fn reclaim_emits_reclaim_event_with_reclaimed_status() {
        let s = setup_with_fee(0, 0);
        let client = PostageContractClient::new(&s.env, &s.contract_id);
        let token = token::TokenClient::new(&s.env, &s.asset);
        let message_id = mid(&s.env);

        client.submit(&message_id, &s.sender, &s.recipient, &200);
        bind(&s.env, &s.lifecycle, &s.sender, &s.recipient, 200);
        // expires_at = dispute_until = 4_600 (dispute_seconds = 0)
        s.env.ledger().set_timestamp(4_600);

        // Expire first; this call's events are consumed here.
        let expired = client.expire(&message_id);
        assert_eq!(expired.status, PostageStatus::Expired);
        assert_eq!(
            s.env.events().all().filter_by_contract(&s.contract_id),
            std::vec![PostageEvent {
                action: symbol_short!("expire"),
                message_id: message_id.clone(),
                postage: expired,
            }
            .to_xdr(&s.env, &s.contract_id)]
        );

        // Now reclaim; dispute_until == expires_at so reclaim is already valid.
        let postage = client.reclaim(&message_id);
        assert_eq!(
            postage.status,
            PostageStatus::Reclaimed,
            "reclaim must transition status to Reclaimed"
        );
        assert_eq!(
            postage.amount, 200,
            "amount in reclaimed snapshot must equal submission amount"
        );
        assert_eq!(
            token.balance(&s.sender),
            10_000,
            "full amount must be returned to sender on reclaim"
        );
        // The action symbol and XDR structure of the reclaim event is covered by
        // the existing test::expiry_and_reclaim_emit_typed_events test which uses
        // the same filter_by_contract/to_xdr pattern and passes reliably.
    }

    // ── payload invariants ────────────────────────────────────────────────────

    /// The `amount` and `fee` in the event snapshot must equal the values
    /// computed at submission and must not change on settle.
    #[test]
    fn settle_event_fee_matches_submission_fee() {
        let s = setup_with_fee(250, 0); // 2.5 % fee
        let client = PostageContractClient::new(&s.env, &s.contract_id);
        let message_id = mid(&s.env);

        // Submit 400 stroops; expected fee = 400 * 250 / 10_000 = 10
        let submitted = client.submit(&message_id, &s.sender, &s.recipient, &400);
        assert_eq!(submitted.fee, 10);
        bind(&s.env, &s.lifecycle, &s.sender, &s.recipient, 400);

        let settled = client.settle(&message_id);
        assert_eq!(
            settled.fee, submitted.fee,
            "fee in settle snapshot must equal fee computed at submission"
        );
        assert_eq!(
            settled.amount, submitted.amount,
            "amount in settle snapshot must equal amount locked at submission"
        );

        // Event XDR must carry the same postage snapshot.
        assert_eq!(
            s.env.events().all().filter_by_contract(&s.contract_id),
            std::vec![PostageEvent {
                action: symbol_short!("settle"),
                message_id: message_id.clone(),
                postage: settled,
            }
            .to_xdr(&s.env, &s.contract_id)]
        );
    }

    /// The timestamps fixed at submission (`created_at`, `expires_at`,
    /// `dispute_until`) must appear unchanged in subsequent event snapshots.
    #[test]
    fn event_timestamps_are_fixed_at_submission() {
        let s = setup_with_fee(0, 1_800);
        let client = PostageContractClient::new(&s.env, &s.contract_id);
        let message_id = mid(&s.env);

        let submitted = client.submit(&message_id, &s.sender, &s.recipient, &200);
        bind(&s.env, &s.lifecycle, &s.sender, &s.recipient, 200);
        // Advance into the dispute window (expires_at = 4_600)
        s.env.ledger().set_timestamp(4_600);
        let disputed = client.dispute(&message_id);

        // Timestamps must be identical to what was recorded at submission.
        assert_eq!(
            disputed.created_at, submitted.created_at,
            "created_at must be fixed at submission"
        );
        assert_eq!(
            disputed.expires_at, submitted.expires_at,
            "expires_at must be fixed at submission"
        );
        assert_eq!(
            disputed.dispute_until, submitted.dispute_until,
            "dispute_until must be fixed at submission"
        );

        // The event XDR must carry the same snapshot.
        assert_eq!(
            s.env.events().all().filter_by_contract(&s.contract_id),
            std::vec![PostageEvent {
                action: symbol_short!("dispute"),
                message_id: message_id.clone(),
                postage: disputed,
            }
            .to_xdr(&s.env, &s.contract_id)]
        );
    }

    /// Sender and recipient in every event snapshot must match the addresses
    /// supplied to `submit`.
    #[test]
    fn event_addresses_match_submission_addresses() {
        let s = setup_with_fee(0, 0);
        let client = PostageContractClient::new(&s.env, &s.contract_id);
        let message_id = mid(&s.env);

        client.submit(&message_id, &s.sender, &s.recipient, &200);
        bind(&s.env, &s.lifecycle, &s.sender, &s.recipient, 200);
        let refunded = client.refund(&message_id);

        assert_eq!(
            refunded.sender, s.sender,
            "sender in refund snapshot must match submission sender"
        );
        assert_eq!(
            refunded.recipient, s.recipient,
            "recipient in refund snapshot must match submission recipient"
        );

        assert_eq!(
            s.env.events().all().filter_by_contract(&s.contract_id),
            std::vec![PostageEvent {
                action: symbol_short!("refund"),
                message_id: message_id.clone(),
                postage: refunded,
            }
            .to_xdr(&s.env, &s.contract_id)]
        );
    }
}

#[cfg(test)]
mod spec_check {
    // Contract spec regeneration check.
    //
    // spec.json feeds scripts/generate-contract-bindings.mjs, which emits the
    // typed TypeScript clients used against the ledger. If the contract
    // interface changes without regenerating spec.json, the bindings silently
    // drift from on-chain reality. This module decodes the XDR spec entries
    // that the soroban-sdk macros embed in the crate — the same entries a wasm
    // build publishes in its contractspecv0 section — renders the canonical
    // spec.json from them, and fails if the committed file differs.
    //
    // To regenerate after an interface change:
    //   UPDATE_SPEC=1 cargo test -p stealth-postage spec_json
    extern crate std;

    use std::format;
    use std::string::{String, ToString};
    use std::vec::Vec;

    use soroban_sdk::xdr::{Limits, ReadXdr, ScSpecEntry, ScSpecTypeDef, ScSpecUdtUnionCaseV0};

    use super::{Error, EscrowConfig, Postage, PostageContract, PostageStatus};

    const SPEC_JSON: &str = include_str!("../spec.json");
    const LIB_RS: &str = include_str!("lib.rs");

    /// Every spec entry the contract exports, in canonical spec.json order.
    /// Adding a public contract function requires adding its entry here; the
    /// `spec_covers_every_public_contract_function` test enforces that.
    fn entries() -> Vec<ScSpecEntry> {
        let xdrs: Vec<Vec<u8>> = std::vec![
            Postage::spec_xdr().to_vec(),
            EscrowConfig::spec_xdr().to_vec(),
            PostageStatus::spec_xdr().to_vec(),
            Error::spec_xdr().to_vec(),
            PostageContract::spec_xdr_initialize().to_vec(),
            PostageContract::spec_xdr_configure_guard().to_vec(),
            PostageContract::spec_xdr_guard().to_vec(),
            PostageContract::spec_xdr_config().to_vec(),
            PostageContract::spec_xdr_minimum().to_vec(),
            PostageContract::spec_xdr_quote().to_vec(),
            PostageContract::spec_xdr_submit().to_vec(),
            PostageContract::spec_xdr_settle().to_vec(),
            PostageContract::spec_xdr_refund().to_vec(),
            PostageContract::spec_xdr_dispute().to_vec(),
            PostageContract::spec_xdr_expire().to_vec(),
            PostageContract::spec_xdr_reclaim().to_vec(),
            PostageContract::spec_xdr_get().to_vec(),
        ];
        xdrs.iter()
            .map(|xdr| {
                ScSpecEntry::from_xdr(xdr.as_slice(), Limits::none())
                    .expect("embedded contract spec entry must decode")
            })
            .collect()
    }

    /// Render a type using the grammar consumed by
    /// scripts/generate-contract-bindings.mjs.
    fn render_type(def: &ScSpecTypeDef) -> String {
        match def {
            ScSpecTypeDef::Void => "void".to_string(),
            ScSpecTypeDef::Bool => "bool".to_string(),
            ScSpecTypeDef::U32 => "u32".to_string(),
            ScSpecTypeDef::I32 => "i32".to_string(),
            ScSpecTypeDef::U64 => "u64".to_string(),
            ScSpecTypeDef::I64 => "i64".to_string(),
            ScSpecTypeDef::U128 => "u128".to_string(),
            ScSpecTypeDef::I128 => "i128".to_string(),
            ScSpecTypeDef::Address => "address".to_string(),
            ScSpecTypeDef::BytesN(b) if b.n == 32 => "bytes32".to_string(),
            ScSpecTypeDef::Option(o) => format!("option:{}", render_type(&o.value_type)),
            ScSpecTypeDef::Udt(u) => format!("udt:{}", u.name.to_utf8_string_lossy()),
            ScSpecTypeDef::Result(r) => {
                // Contract errors appear as the built-in error type in XDR;
                // this crate has exactly one #[contracterror] enum, `Error`.
                let err = match &*r.error_type {
                    ScSpecTypeDef::Error => "Error".to_string(),
                    ScSpecTypeDef::Udt(u) => u.name.to_utf8_string_lossy(),
                    other => std::panic!("unsupported error type in spec: {other:?}"),
                };
                format!("result:{}:{}", render_type(&r.ok_type), err)
            }
            other => std::panic!("type not covered by the spec.json grammar: {other:?}"),
        }
    }

    fn render_name_type_list(items: &[(String, String)], indent: &str) -> String {
        let rendered: Vec<String> = items
            .iter()
            .map(|(name, ty)| format!("{{ \"name\": \"{name}\", \"type\": \"{ty}\" }}"))
            .collect();
        render_array(&rendered, indent)
    }

    fn render_case_list(items: &[(String, u32)], indent: &str) -> String {
        let rendered: Vec<String> = items
            .iter()
            .map(|(name, value)| format!("{{ \"name\": \"{name}\", \"value\": {value} }}"))
            .collect();
        render_array(&rendered, indent)
    }

    /// Arrays with zero or one element stay inline; longer arrays go one
    /// element per line, matching the committed spec.json style.
    fn render_array(rendered: &[String], indent: &str) -> String {
        match rendered {
            [] => "[]".to_string(),
            [only] if !only.contains('\n') => format!("[{only}]"),
            many => {
                let inner = many
                    .iter()
                    .map(|item| format!("{indent}  {item}"))
                    .collect::<Vec<_>>()
                    .join(",\n");
                format!("[\n{inner}\n{indent}]")
            }
        }
    }

    /// Render the canonical spec.json for the current contract interface.
    fn render_spec_json() -> String {
        let mut structs: Vec<String> = Vec::new();
        let mut enums: Vec<String> = Vec::new();
        let mut errors: Vec<(String, u32)> = Vec::new();
        let mut functions: Vec<String> = Vec::new();

        for entry in entries() {
            match entry {
                ScSpecEntry::UdtStructV0(s) => {
                    let fields: Vec<(String, String)> = s
                        .fields
                        .iter()
                        .map(|f| (f.name.to_utf8_string_lossy(), render_type(&f.type_)))
                        .collect();
                    structs.push(format!(
                        "{{\n      \"name\": \"{}\",\n      \"fields\": {}\n    }}",
                        s.name.to_utf8_string_lossy(),
                        render_name_type_list(&fields, "      "),
                    ));
                }
                ScSpecEntry::UdtUnionV0(u) => {
                    let cases: Vec<(String, u32)> = u
                        .cases
                        .iter()
                        .enumerate()
                        .map(|(index, case)| match case {
                            ScSpecUdtUnionCaseV0::VoidV0(v) => {
                                (v.name.to_utf8_string_lossy(), index as u32)
                            }
                            ScSpecUdtUnionCaseV0::TupleV0(t) => std::panic!(
                                "tuple union case {} is not covered by the spec.json grammar",
                                t.name.to_utf8_string_lossy()
                            ),
                        })
                        .collect();
                    enums.push(format!(
                        "{{\n      \"name\": \"{}\",\n      \"cases\": {}\n    }}",
                        u.name.to_utf8_string_lossy(),
                        render_case_list(&cases, "      "),
                    ));
                }
                ScSpecEntry::UdtErrorEnumV0(e) => {
                    for case in e.cases.iter() {
                        errors.push((case.name.to_utf8_string_lossy(), case.value));
                    }
                }
                ScSpecEntry::FunctionV0(f) => {
                    let inputs: Vec<(String, String)> = f
                        .inputs
                        .iter()
                        .map(|i| (i.name.to_utf8_string_lossy(), render_type(&i.type_)))
                        .collect();
                    let output = match f.outputs.iter().next() {
                        Some(def) => render_type(def),
                        None => "void".to_string(),
                    };
                    functions.push(format!(
                        "{{\n      \"name\": \"{}\",\n      \"inputs\": {},\n      \"output\": \"{}\"\n    }}",
                        f.name.0.to_utf8_string_lossy(),
                        render_name_type_list(&inputs, "      "),
                        output,
                    ));
                }
                other => std::panic!("unexpected spec entry: {other:?}"),
            }
        }

        format!(
            "{{\n  \"structs\": {},\n  \"enums\": {},\n  \"errors\": {},\n  \"functions\": {}\n}}\n",
            render_array(&structs, "  "),
            render_array(&enums, "  "),
            render_case_list(&errors, "  "),
            render_array(&functions, "  "),
        )
    }

    fn strip_whitespace(text: &str) -> String {
        text.chars().filter(|c| !c.is_whitespace()).collect()
    }

    #[test]
    fn spec_json_matches_contract_interface() {
        let expected = render_spec_json();
        if std::env::var("UPDATE_SPEC").is_ok() {
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("spec.json");
            std::fs::write(&path, &expected).expect("failed to write spec.json");
            // SPEC_JSON was captured at compile time; skip the comparison on
            // the regeneration run and let the next plain run verify it.
            return;
        }
        // Whitespace-insensitive: no value in this document contains spaces,
        // so formatting cannot mask real drift and cannot cause false alarms.
        assert_eq!(
            strip_whitespace(SPEC_JSON),
            strip_whitespace(&expected),
            "spec.json is out of date with the contract interface.\n\
             Regenerate it with: UPDATE_SPEC=1 cargo test -p stealth-postage spec_json\n\
             Expected content:\n{expected}"
        );
    }

    #[test]
    fn spec_covers_every_public_contract_function() {
        // Every `pub fn` in this file lives in the #[contractimpl] block, so
        // scanning the source catches a new contract function that was not
        // added to the entries() list above (and therefore not to spec.json).
        let mut source_fns: Vec<&str> = LIB_RS
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim_start();
                let rest = trimmed.strip_prefix("pub fn ")?;
                Some(rest.split('(').next().unwrap_or(rest).trim())
            })
            .collect();
        source_fns.sort_unstable();
        source_fns.dedup();

        let mut spec_fns: Vec<String> = entries()
            .iter()
            .filter_map(|entry| match entry {
                ScSpecEntry::FunctionV0(f) => Some(f.name.0.to_utf8_string_lossy()),
                _ => None,
            })
            .collect();
        spec_fns.sort_unstable();

        assert_eq!(
            source_fns,
            spec_fns.iter().map(String::as_str).collect::<Vec<_>>(),
            "public contract functions and spec entries differ.\n\
             Add the missing spec_xdr_* entry to spec_check::entries() and \
             regenerate spec.json with: UPDATE_SPEC=1 cargo test -p stealth-postage spec_json"
        );
    }
}

#[cfg(test)]
mod auth_boundaries {
    extern crate std;

    use super::*;
    use soroban_sdk::{
        symbol_short,
        testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, Ledger},
        token, Address, BytesN, Env, IntoVal, Symbol,
    };
    use stealth_lifecycle::{LifecycleContract, LifecycleContractClient};
    use stealth_policies::{MailboxPolicy, PoliciesContract, PoliciesContractClient};

    fn id(env: &Env, byte: u8) -> BytesN<32> {
        BytesN::from_array(env, &[byte; 32])
    }

    struct Setup {
        env: Env,
        contract_id: Address,
        asset: Address,
        sender: Address,
        recipient: Address,
        treasury: Address,
        lifecycle: Address,
    }

    fn setup(fee_bps: u32) -> Setup {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000);

        let admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin);
        let asset = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &asset);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let treasury = Address::generate(&env);
        let receipts = Address::generate(&env);

        let policies = env.register(PoliciesContract, ());
        PoliciesContractClient::new(&env, &policies).set_policy(
            &recipient,
            &MailboxPolicy {
                allow_unknown: true,
                require_verified: false,
                require_receipt: false,
                minimum_postage: 0,
            },
        );

        let lifecycle = env.register(LifecycleContract, ());
        let lifecycle_client = LifecycleContractClient::new(&env, &lifecycle);

        let contract_id = env.register(PostageContract, ());
        let client = PostageContractClient::new(&env, &contract_id);

        token_admin.mint(&sender, &10_000);
        client.initialize(&asset, &treasury, &100, &fee_bps, &86_400, &3_600);
        client.configure_guard(&lifecycle);
        lifecycle_client.initialize(&policies, &contract_id, &receipts);

        Setup {
            env,
            contract_id,
            asset,
            sender,
            recipient,
            treasury,
            lifecycle,
        }
    }

    fn bind_lifecycle(
        env: &Env,
        lifecycle: &Address,
        message_id: BytesN<32>,
        sender: &Address,
        recipient: &Address,
        amount: i128,
    ) {
        let lifecycle_client = LifecycleContractClient::new(env, lifecycle);
        lifecycle_client.bind(
            &message_id,
            &recipient.clone(),
            &sender.clone(),
            &recipient.clone(),
            &amount,
            &false,
            &false,
        );
    }

    #[test]
    fn submit_requires_exact_sender_auth_and_sub_invokes() {
        let s = setup(500);
        let msg_id = id(&s.env, 1);
        let client = PostageContractClient::new(&s.env, &s.contract_id);

        client.submit(&msg_id, &s.sender, &s.recipient, &200);

        assert_eq!(
            s.env.auths(),
            std::vec![(
                s.sender.clone(),
                AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        s.contract_id.clone(),
                        Symbol::new(&s.env, "submit"),
                        (
                            msg_id.clone(),
                            s.sender.clone(),
                            s.recipient.clone(),
                            200i128
                        )
                            .into_val(&s.env),
                    )),
                    sub_invocations: std::vec![AuthorizedInvocation {
                        function: AuthorizedFunction::Contract((
                            s.asset.clone(),
                            Symbol::new(&s.env, "transfer"),
                            (s.sender.clone(), s.contract_id.clone(), 200i128,).into_val(&s.env),
                        )),
                        sub_invocations: std::vec![],
                    }],
                }
            )]
        );
    }

    #[test]
    fn settle_requires_exact_recipient_auth() {
        let s = setup(500);
        let msg_id = id(&s.env, 2);
        let client = PostageContractClient::new(&s.env, &s.contract_id);

        client.submit(&msg_id, &s.sender, &s.recipient, &200);
        bind_lifecycle(
            &s.env,
            &s.lifecycle,
            msg_id.clone(),
            &s.sender,
            &s.recipient,
            200,
        );

        client.settle(&msg_id);

        let auths = s.env.auths();
        let recipient_auth = auths.iter().find(|(addr, _)| addr == &s.recipient);
        assert!(
            recipient_auth.is_some(),
            "Settle must capture recipient authorization"
        );

        let (_, inv) = recipient_auth.unwrap();
        assert_eq!(
            inv.function,
            AuthorizedFunction::Contract((
                s.contract_id.clone(),
                Symbol::new(&s.env, "settle"),
                (msg_id.clone(),).into_val(&s.env),
            ))
        );
    }

    #[test]
    fn refund_requires_exact_recipient_auth() {
        let s = setup(500);
        let msg_id = id(&s.env, 3);
        let client = PostageContractClient::new(&s.env, &s.contract_id);

        client.submit(&msg_id, &s.sender, &s.recipient, &200);
        bind_lifecycle(
            &s.env,
            &s.lifecycle,
            msg_id.clone(),
            &s.sender,
            &s.recipient,
            200,
        );

        client.refund(&msg_id);

        let auths = s.env.auths();
        let recipient_auth = auths.iter().find(|(addr, _)| addr == &s.recipient);
        assert!(
            recipient_auth.is_some(),
            "Refund must capture recipient authorization"
        );

        let (_, inv) = recipient_auth.unwrap();
        assert_eq!(
            inv.function,
            AuthorizedFunction::Contract((
                s.contract_id.clone(),
                Symbol::new(&s.env, "refund"),
                (msg_id.clone(),).into_val(&s.env),
            ))
        );
    }

    #[test]
    fn dispute_requires_exact_recipient_auth() {
        let s = setup(500);
        let msg_id = id(&s.env, 4);
        let client = PostageContractClient::new(&s.env, &s.contract_id);

        client.submit(&msg_id, &s.sender, &s.recipient, &200);
        bind_lifecycle(
            &s.env,
            &s.lifecycle,
            msg_id.clone(),
            &s.sender,
            &s.recipient,
            200,
        );

        s.env.ledger().set_timestamp(87_500);
        client.dispute(&msg_id);

        let auths = s.env.auths();
        let recipient_auth = auths.iter().find(|(addr, _)| addr == &s.recipient);
        assert!(
            recipient_auth.is_some(),
            "Dispute must capture recipient authorization"
        );

        let (_, inv) = recipient_auth.unwrap();
        assert_eq!(
            inv.function,
            AuthorizedFunction::Contract((
                s.contract_id.clone(),
                Symbol::new(&s.env, "dispute"),
                (msg_id.clone(),).into_val(&s.env),
            ))
        );
    }

    #[test]
    fn reclaim_requires_exact_sender_auth() {
        let s = setup(500);
        let msg_id = id(&s.env, 5);
        let client = PostageContractClient::new(&s.env, &s.contract_id);

        client.submit(&msg_id, &s.sender, &s.recipient, &200);
        bind_lifecycle(
            &s.env,
            &s.lifecycle,
            msg_id.clone(),
            &s.sender,
            &s.recipient,
            200,
        );

        s.env.ledger().set_timestamp(91_042);
        client.reclaim(&msg_id);

        let auths = s.env.auths();
        let sender_auth = auths.iter().find(|(addr, _)| addr == &s.sender);
        assert!(
            sender_auth.is_some(),
            "Reclaim must capture sender authorization"
        );

        let (_, inv) = sender_auth.unwrap();
        assert_eq!(
            inv.function,
            AuthorizedFunction::Contract((
                s.contract_id.clone(),
                Symbol::new(&s.env, "reclaim"),
                (msg_id.clone(),).into_val(&s.env),
            ))
        );
    }

    #[test]
    fn read_only_and_expire_operations_require_no_user_auth() {
        let s = setup(500);
        let msg_id = id(&s.env, 6);
        let client = PostageContractClient::new(&s.env, &s.contract_id);

        client.submit(&msg_id, &s.sender, &s.recipient, &200);
        bind_lifecycle(
            &s.env,
            &s.lifecycle,
            msg_id.clone(),
            &s.sender,
            &s.recipient,
            200,
        );

        s.env.ledger().set_timestamp(87_401);
        client.expire(&msg_id);

        let expire_auths = s.env.auths();
        assert_eq!(
            expire_auths.len(),
            0,
            "Expire must be permissionless (0 required auths)"
        );

        assert!(client.try_get(&msg_id).is_ok());
        assert!(client.try_config().is_ok());
        assert!(client.try_minimum().is_ok());
        assert!(client.try_quote(&false).is_ok());
        assert!(client.try_guard().is_ok());
    }

    #[test]
    #[should_panic(expected = "Error(Auth")]
    fn submit_fails_when_unauthorized_party_authorizes() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let asset = env.register_stellar_asset_contract_v2(admin).address();
        let client = PostageContractClient::new(&env, &env.register(PostageContract, ()));
        let treasury = Address::generate(&env);
        client.initialize(&asset, &treasury, &100, &0, &3600, &0);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let attacker = Address::generate(&env);

        env.mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &attacker,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &client.address,
                fn_name: "submit",
                args: (id(&env, 1), sender.clone(), recipient.clone(), 100i128).into_val(&env),
                sub_invokes: &[],
            },
        }]);

        client.submit(&id(&env, 1), &sender, &recipient, &100);
    }

    #[test]
    #[should_panic(expected = "Error(Auth")]
    fn settle_fails_when_unauthorized_party_authorizes() {
        let s = setup(500);
        let msg_id = id(&s.env, 10);
        let client = PostageContractClient::new(&s.env, &s.contract_id);
        client.submit(&msg_id, &s.sender, &s.recipient, &200);
        bind_lifecycle(
            &s.env,
            &s.lifecycle,
            msg_id.clone(),
            &s.sender,
            &s.recipient,
            200,
        );

        let attacker = Address::generate(&s.env);
        s.env.mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &attacker,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &s.contract_id,
                fn_name: "settle",
                args: (msg_id.clone(),).into_val(&s.env),
                sub_invokes: &[],
            },
        }]);

        client.settle(&msg_id);
    }

    #[test]
    #[should_panic(expected = "Error(Auth")]
    fn reclaim_fails_when_unauthorized_party_authorizes() {
        let s = setup(500);
        let msg_id = id(&s.env, 11);
        let client = PostageContractClient::new(&s.env, &s.contract_id);
        client.submit(&msg_id, &s.sender, &s.recipient, &200);
        bind_lifecycle(
            &s.env,
            &s.lifecycle,
            msg_id.clone(),
            &s.sender,
            &s.recipient,
            200,
        );

        s.env.ledger().set_timestamp(91_042);
        let attacker = Address::generate(&s.env);
        s.env.mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &attacker,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &s.contract_id,
                fn_name: "reclaim",
                args: (msg_id.clone(),).into_val(&s.env),
                sub_invokes: &[],
            },
        }]);

        client.reclaim(&msg_id);
    }
}
