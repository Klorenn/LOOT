#![no_std]
//! ChestZK factory: deploys one `ChestOne` contract per chest.
//! The factory NEVER holds prize funds: creation fee goes creator -> treasury and
//! the prize + prepaid fee reserve go creator -> chest, all inside `create_chest`.
//!
//! TTL: no extend_ttl on the factory instance (it would extend the factory wasm and
//! cost thousands of XLM on testnet); ops bump it. Only the new `ChestAt` listing
//! entry is extended, proportional to the chest duration.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, token, Address, BytesN,
    Env, String, Symbol, Vec,
};

const MAX_QUESTION_LEN: u32 = 280;
const MAX_PLACES: u32 = 50;
const MAX_LIST_LIMIT: u32 = 50;
const MAX_DAILY_FEE_BPS: u32 = 100; // 1%/day hard cap

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    /// prize sum overflows i128
    BadAmounts = 1,
    BadDuration = 2,
    BadFees = 3,
    QuestionTooLong = 4,
    NoPendingAdmin = 6,
    /// empty, longer than 50, or a non-positive tier
    BadSchedule = 7,
}

#[derive(Clone)]
#[contracttype]
pub struct Config {
    pub admin: Address,
    pub treasury: Address,
    pub chest_wasm_hash: BytesN<32>,
    pub verifier: Address,
    pub token: Address,
    /// stroops, charged once per chest, non-refundable
    pub creation_fee: i128,
    pub daily_fee_bps: u32,
    pub max_duration_days: u32,
}

/// Same shape as `ChestInit` in chest-one (constructor argument).
#[derive(Clone)]
#[contracttype]
pub struct ChestInit {
    pub creator: Address,
    pub verifier: Address,
    pub token: Address,
    pub treasury: Address,
    pub question: String,
    pub fingerprint: BytesN<32>,
    pub prizes: Vec<i128>,
    pub duration_days: u32,
    pub daily_fee_bps: u32,
    pub fee_reserve: i128,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Config,
    Count,
    ChestAt(u32),
    PendingAdmin,
}

#[contractclient(name = "ChestClient")]
pub trait ChestIface {
    fn close(env: Env) -> i128;
    fn creator(env: Env) -> Address;
}

#[contract]
pub struct ChestFactory;

#[contractimpl]
impl ChestFactory {
    #[allow(clippy::too_many_arguments)]
    pub fn __constructor(
        env: Env,
        admin: Address,
        treasury: Address,
        chest_wasm_hash: BytesN<32>,
        verifier: Address,
        token: Address,
        creation_fee: i128,
        daily_fee_bps: u32,
        max_duration_days: u32,
    ) {
        Self::check_fees(creation_fee, daily_fee_bps, max_duration_days).unwrap();
        let cfg = Config {
            admin,
            treasury,
            chest_wasm_hash,
            verifier,
            token,
            creation_fee,
            daily_fee_bps,
            max_duration_days,
        };
        env.storage().instance().set(&DataKey::Config, &cfg);
        env.storage().instance().set(&DataKey::Count, &0u32);
    }

    pub fn create_chest(
        env: Env,
        creator: Address,
        question: String,
        fingerprint: BytesN<32>,
        prizes: Vec<i128>,
        duration_days: u32,
    ) -> Result<Address, Error> {
        creator.require_auth();
        let cfg = Self::cfg(&env);
        if prizes.is_empty() || prizes.len() > MAX_PLACES {
            return Err(Error::BadSchedule);
        }
        if duration_days == 0 || duration_days > cfg.max_duration_days {
            return Err(Error::BadDuration);
        }
        if question.len() > MAX_QUESTION_LEN {
            return Err(Error::QuestionTooLong);
        }
        let mut prize: i128 = 0;
        for p in prizes.iter() {
            if p <= 0 {
                return Err(Error::BadSchedule);
            }
            prize = prize.checked_add(p).ok_or(Error::BadAmounts)?;
        }
        // Prepaid fee reserve: simple, on the initial prize, for the whole duration.
        let reserve = prize
            .checked_mul(cfg.daily_fee_bps as i128)
            .and_then(|v| v.checked_mul(duration_days as i128))
            .ok_or(Error::BadAmounts)?
            / 10_000;

        let count: u32 = env.storage().instance().get(&DataKey::Count).unwrap();
        let mut salt = [0u8; 32];
        salt[28..].copy_from_slice(&count.to_be_bytes());

        let init = ChestInit {
            creator: creator.clone(),
            verifier: cfg.verifier.clone(),
            token: cfg.token.clone(),
            treasury: cfg.treasury.clone(),
            question,
            fingerprint,
            prizes,
            duration_days,
            daily_fee_bps: cfg.daily_fee_bps,
            fee_reserve: reserve,
        };
        let chest = env
            .deployer()
            .with_current_contract(BytesN::from_array(&env, &salt))
            .deploy_v2(cfg.chest_wasm_hash.clone(), (init,));

        // Funds never pass through the factory.
        let tok = token::Client::new(&env, &cfg.token);
        if cfg.creation_fee > 0 {
            tok.transfer(&creator, &cfg.treasury, &cfg.creation_fee);
            env.events().publish(
                (Symbol::new(&env, "fee_creation"), chest.clone()),
                cfg.creation_fee,
            );
        }
        tok.transfer(&creator, &chest, &(prize + reserve));

        let key = DataKey::ChestAt(count);
        env.storage().persistent().set(&key, &chest);
        // Listing entry lives as long as the chest (+2 days); no-op when the network's
        // default TTL already covers it (mainnet: 120 days).
        let live = (duration_days + 2) * 17_280;
        env.storage().persistent().extend_ttl(&key, live, live);
        env.storage().instance().set(&DataKey::Count, &(count + 1));
        env.events().publish(
            (Symbol::new(&env, "chest_created"),),
            (chest.clone(), creator),
        );
        Ok(chest)
    }

    /// Convenience forward. The creator signs at the root so one auth entry covers
    /// the whole tree; the chest itself enforces creator-only before expiry.
    pub fn close(env: Env, chest: Address) -> i128 {
        let client = ChestClient::new(&env, &chest);
        client.creator().require_auth();
        client.close()
    }

    pub fn chest_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }

    /// Paginated, oldest first; `limit` is capped at 50.
    pub fn list_chests(env: Env, start: u32, limit: u32) -> Vec<Address> {
        let count = Self::chest_count(env.clone());
        let limit = core::cmp::min(limit, MAX_LIST_LIMIT);
        let mut out = Vec::new(&env);
        let end = core::cmp::min(count, start.saturating_add(limit));
        let mut i = start;
        while i < end {
            if let Some(a) = env.storage().persistent().get(&DataKey::ChestAt(i)) {
                out.push_back(a);
            }
            i += 1;
        }
        out
    }

    pub fn get_config(env: Env) -> Config {
        Self::cfg(&env)
    }

    /// Admin only. Affects chests created afterwards (each chest copies the fees).
    pub fn set_fees(
        env: Env,
        creation_fee: i128,
        daily_fee_bps: u32,
        max_duration_days: u32,
    ) -> Result<(), Error> {
        let mut cfg = Self::cfg(&env);
        cfg.admin.require_auth();
        Self::check_fees(creation_fee, daily_fee_bps, max_duration_days)?;
        cfg.creation_fee = creation_fee;
        cfg.daily_fee_bps = daily_fee_bps;
        cfg.max_duration_days = max_duration_days;
        env.storage().instance().set(&DataKey::Config, &cfg);
        Ok(())
    }

    pub fn set_treasury(env: Env, treasury: Address) {
        let mut cfg = Self::cfg(&env);
        cfg.admin.require_auth();
        cfg.treasury = treasury;
        env.storage().instance().set(&DataKey::Config, &cfg);
    }

    /// Admin only: wasm used for NEW chests (existing chests are unaffected).
    pub fn set_chest_wasm(env: Env, chest_wasm_hash: BytesN<32>) {
        let mut cfg = Self::cfg(&env);
        cfg.admin.require_auth();
        cfg.chest_wasm_hash = chest_wasm_hash;
        env.storage().instance().set(&DataKey::Config, &cfg);
    }

    /// Two-step admin handover, step 1: current admin proposes.
    pub fn propose_admin(env: Env, new_admin: Address) {
        let cfg = Self::cfg(&env);
        cfg.admin.require_auth();
        env.storage().instance().set(&DataKey::PendingAdmin, &new_admin);
    }

    /// Step 2: the proposed admin accepts (proves it controls the key).
    pub fn accept_admin(env: Env) -> Result<(), Error> {
        let pending: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(Error::NoPendingAdmin)?;
        pending.require_auth();
        let mut cfg = Self::cfg(&env);
        cfg.admin = pending;
        env.storage().instance().set(&DataKey::Config, &cfg);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        Ok(())
    }

    fn cfg(env: &Env) -> Config {
        env.storage().instance().get(&DataKey::Config).unwrap()
    }

    fn check_fees(creation_fee: i128, bps: u32, max_days: u32) -> Result<(), Error> {
        if creation_fee < 0 || bps > MAX_DAILY_FEE_BPS || max_days == 0 {
            return Err(Error::BadFees);
        }
        Ok(())
    }
}

#[cfg(test)]
mod test;
