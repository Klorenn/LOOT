#![no_std]
//! ChestZK "one contract per chest". Deployed by `chestzk-factory`.
//!
//! Claim logic and verifier call are the same as the registry contract
//! (`contracts/chest`): Groth16 BN254 proof checked by an external verifier
//! with public inputs [fingerprint, nullifier, chestId, recipient].
//! Here `chestId` is the field element of THIS contract's address, so a proof
//! is bound to one chest and one recipient. The nullifier is
//! Poseidon(playerSecret, chestId); the circuit does NOT bind playerSecret to the
//! recipient, so it limits replays of one proof, not claims per person.
//!
//! Init: `__constructor` runs only inside the deploy transaction, which only the
//! factory can issue for this address (deployer = factory); there is no callable
//! `init`, so it cannot be front-run or re-run. Args are packed into `ChestInit`
//! so every exported function has <= 10 parameters (older SDK decoders).
//!
//! Fee model (prepaid reserve): the token balance is split in two buckets.
//! - `prize_pool`: sum of the unpaid tiers of `prizes`. Fees can never touch it.
//!   Place k (claim order, 0-based) receives exactly `prizes[k]`.
//! - `fee_reserve`: prepaid at creation = prize_initial * bps * days / 10000.
//! Daily fees (prize_initial * bps * elapsed_days / 10000) are taken ONLY from
//! the reserve, lazily, and sent to `treasury`. Unused reserve is refunded on close.
//! If the treasury transfer fails the fee is skipped (stays in the reserve), so
//! claim and close can never be blocked by the treasury.
//! Invariant: token balance == prize_pool + fee_reserve.
//!
//! TTL: no explicit extend_ttl here on purpose. Extending the instance also extends
//! the shared wasm code entry, which made rent explode on testnet. Mainnet default
//! persistent TTL (120 days) covers the 30-day max duration; ops can bump if needed.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, vec, xdr::ToXdr,
    Address, Bytes, BytesN, Env, IntoVal, String, Symbol, Vec,
};

pub const DAY: u64 = 86_400;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    ChestClosed = 2,
    ChestExpired = 3,
    SoldOut = 4,
    NullifierUsed = 5,
    InvalidProof = 6,
}

/// Wire-compatible with the generated verifier `Proof`.
#[derive(Clone)]
#[contracttype]
pub struct Proof {
    pub a: BytesN<64>,
    pub b: BytesN<128>,
    pub c: BytesN<64>,
}

/// Constructor arguments packed in one struct (same shape in the factory).
#[derive(Clone)]
#[contracttype]
pub struct ChestInit {
    pub creator: Address,
    pub verifier: Address,
    pub token: Address,
    pub treasury: Address,
    pub question: String,
    pub fingerprint: BytesN<32>,
    /// prize schedule, index = claim order (1st, 2nd, ...)
    pub prizes: Vec<i128>,
    pub duration_days: u32,
    pub daily_fee_bps: u32,
    /// prepaid fee reserve, computed by the factory
    pub fee_reserve: i128,
}

#[derive(Clone)]
#[contracttype]
pub struct ChestInfo {
    pub creator: Address,
    pub verifier: Address,
    pub token: Address,
    pub treasury: Address,
    pub question: String,
    pub fingerprint: BytesN<32>,
    /// prize schedule, index = claim order; place k pays prizes[k]
    pub prizes: Vec<i128>,
    /// number of places (== prizes.len())
    pub slots: u32,
    /// claims so far == the next place to be paid (0-based)
    pub claims: u32,
    pub expiry: u64,
    pub last_fee_ts: u64,
    pub daily_fee_bps: u32,
    pub closed: bool,
    /// sum(prizes) (base of the daily fee)
    pub prize_initial: i128,
    /// unclaimed prize, untouchable by fees
    pub prize_pool: i128,
    /// prepaid fees not yet charged
    pub fee_reserve: i128,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Info,
    Nullifier(BytesN<32>),
}

#[contract]
pub struct ChestOne;

#[contractimpl]
impl ChestOne {
    pub fn __constructor(env: Env, init: ChestInit) {
        let now = env.ledger().timestamp();
        let mut prize: i128 = 0;
        for p in init.prizes.iter() {
            prize += p;
        }
        let slots = init.prizes.len();
        let info = ChestInfo {
            creator: init.creator,
            verifier: init.verifier,
            token: init.token,
            treasury: init.treasury,
            question: init.question,
            fingerprint: init.fingerprint,
            prizes: init.prizes,
            slots,
            claims: 0,
            expiry: now + (init.duration_days as u64) * DAY,
            last_fee_ts: now,
            daily_fee_bps: init.daily_fee_bps,
            closed: false,
            prize_initial: prize,
            prize_pool: prize,
            fee_reserve: init.fee_reserve,
        };
        env.storage().instance().set(&DataKey::Info, &info);
    }

    /// Public: anyone may charge the fees already due (from the reserve only).
    /// Returns the fee sent to the treasury.
    pub fn accrue_fees(env: Env) -> i128 {
        let mut info = Self::load(&env);
        let fee = Self::accrue(&env, &mut info);
        Self::save(&env, &info);
        fee
    }

    pub fn claim(
        env: Env,
        recipient: Address,
        nullifier: BytesN<32>,
        proof: Proof,
    ) -> Result<(), Error> {
        let mut info = Self::load(&env);
        let me = env.current_contract_address();

        if info.closed {
            return Err(Error::ChestClosed);
        }
        if env.ledger().timestamp() > info.expiry {
            return Err(Error::ChestExpired);
        }
        if info.claims >= info.slots {
            return Err(Error::SoldOut);
        }
        let nkey = DataKey::Nullifier(nullifier.clone());
        if env.storage().persistent().has(&nkey) {
            return Err(Error::NullifierUsed);
        }

        // Fees first (reserve only); the prize is never reduced.
        Self::accrue(&env, &mut info);

        // Circuit order: [fingerprint, nullifier, chestId, recipient]
        let mut publics: Vec<BytesN<32>> = Vec::new(&env);
        publics.push_back(info.fingerprint.clone());
        publics.push_back(nullifier.clone());
        publics.push_back(Self::field_from_address(&env, &me));
        publics.push_back(Self::field_from_address(&env, &recipient));

        let args = vec![&env, proof.into_val(&env), publics.into_val(&env)];
        // try_: a malformed proof (verifier trap) is InvalidProof, not a host panic.
        let res = env.try_invoke_contract::<bool, soroban_sdk::Error>(
            &info.verifier,
            &Symbol::new(&env, "verify_proof"),
            args,
        );
        if !matches!(res, Ok(Ok(true))) {
            env.events()
                .publish((symbol_short!("rejected"), me.clone()), nullifier);
            return Err(Error::InvalidProof);
        }

        env.storage().persistent().set(&nkey, &true);
        let place = info.claims; // 0-based; this winner takes prizes[place]
        let amount = info.prizes.get(place).unwrap();
        info.claims += 1;
        info.prize_pool -= amount;
        Self::save(&env, &info);

        token::Client::new(&env, &info.token).transfer(&me, &recipient, &amount);
        // (recipient, place 1-based, amount paid)
        env.events()
            .publish((symbol_short!("claimed"), me), (recipient, place + 1, amount));
        Ok(())
    }

    /// Creator any time; anyone once the chest has expired (refund still goes to the
    /// creator). Charges due fees, then refunds unclaimed prize + leftover reserve.
    pub fn close(env: Env) -> Result<i128, Error> {
        let mut info = Self::load(&env);
        if env.ledger().timestamp() <= info.expiry {
            info.creator.require_auth();
        }
        if info.closed {
            return Err(Error::ChestClosed);
        }
        Self::accrue(&env, &mut info);
        let refund = info.prize_pool + info.fee_reserve;
        if refund > 0 {
            token::Client::new(&env, &info.token).transfer(
                &env.current_contract_address(),
                &info.creator,
                &refund,
            );
        }
        info.prize_pool = 0;
        info.fee_reserve = 0;
        info.closed = true;
        Self::save(&env, &info);
        env.events()
            .publish((symbol_short!("closed"), env.current_contract_address()), refund);
        Ok(refund)
    }

    /// Next place to be paid, 1-based, with its amount; None when sold out or closed.
    pub fn next_prize(env: Env) -> Option<(u32, i128)> {
        let info = Self::load(&env);
        if info.closed || info.claims >= info.slots {
            return None;
        }
        Some((info.claims + 1, info.prizes.get(info.claims).unwrap()))
    }

    pub fn creator(env: Env) -> Address {
        Self::load(&env).creator
    }

    pub fn get_info(env: Env) -> ChestInfo {
        Self::load(&env)
    }

    /// Live token balance (== prize_pool + fee_reserve).
    pub fn balance(env: Env) -> i128 {
        let info = Self::load(&env);
        token::Client::new(&env, &info.token).balance(&env.current_contract_address())
    }

    /// Field element used as `chestId` public input (clients need the same).
    pub fn chest_field(env: Env) -> BytesN<32> {
        Self::field_from_address(&env, &env.current_contract_address())
    }

    fn load(env: &Env) -> ChestInfo {
        env.storage().instance().get(&DataKey::Info).unwrap()
    }

    fn save(env: &Env, info: &ChestInfo) {
        env.storage().instance().set(&DataKey::Info, info);
    }

    /// Simple (non-compounded) daily fee on the INITIAL prize, taken only from
    /// `fee_reserve`. Accrual stops at expiry. If the treasury transfer fails the
    /// fee stays in the reserve and `last_fee_ts` is not advanced (retried later).
    fn accrue(env: &Env, info: &mut ChestInfo) -> i128 {
        if info.closed {
            return 0;
        }
        let now = env.ledger().timestamp();
        let eff = if now < info.expiry { now } else { info.expiry };
        if eff <= info.last_fee_ts {
            return 0;
        }
        let days = (eff - info.last_fee_ts) / DAY;
        if days == 0 {
            return 0;
        }
        let mut fee = info.prize_initial * (info.daily_fee_bps as i128) * (days as i128) / 10_000;
        if fee > info.fee_reserve {
            fee = info.fee_reserve;
        }
        if fee > 0 {
            let me = env.current_contract_address();
            let sent = token::Client::new(env, &info.token).try_transfer(&me, &info.treasury, &fee);
            if !matches!(sent, Ok(Ok(()))) {
                return 0;
            }
            info.fee_reserve -= fee;
            env.events()
                .publish((Symbol::new(env, "fee_daily"), me), (fee, days as u32));
        }
        info.last_fee_ts += days * DAY;
        fee
    }

    /// sha256(xdr(Address)) with byte[0]=0 (same spec as the registry contract).
    pub(crate) fn field_from_address(env: &Env, addr: &Address) -> BytesN<32> {
        let xdr: Bytes = addr.clone().to_xdr(env);
        let hash: BytesN<32> = env.crypto().sha256(&xdr).to_bytes();
        let mut arr = hash.to_array();
        arr[0] = 0;
        BytesN::from_array(env, &arr)
    }
}
