#![no_std]
//! ChestZK: cofres de premios cuyo reclamo exige una prueba Groth16 (BN254)
//! de que conoces la respuesta, atada a la cuenta que cobra (anti-copia)
//! y con nullifier (una vez por persona y cofre).
//!
//! El verificador vive en otro contrato. No usamos `contractimport!`:
//! en testnet provocaba "Missing Entry Proof" al invocar. En su lugar
//! definimos el wire type `Proof` y llamamos con `Env::invoke_contract`.

use soroban_sdk::{
    Address, Bytes, BytesN, Env, IntoVal, Symbol, Vec, contract, contracterror, contractimpl,
    contracttype, symbol_short, token, vec, xdr::ToXdr,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    ChestNotFound = 1,
    ChestClosed = 2,
    ChestExpired = 3,
    SoldOut = 4,
    NullifierUsed = 5,
    InvalidProof = 6,
    NotCreator = 7,
    StillActive = 8,
    BadAmounts = 9,
    // 10 and 11 were AlreadyInit / NotInit (removed: the constructor replaces init). Not reused.
    NotSetOwner = 12,
    SetNotFound = 13,
    /// create_chest / create_chest_in_set received a token other than the one fixed in the constructor.
    WrongToken = 14,
    /// Deadline must satisfy now < deadline <= now + MAX_DEADLINE.
    BadDeadline = 15,
    /// This recipient already claimed in this group (chest or set). Does NOT stop fresh addresses.
    AlreadyClaimed = 16,
}

/// Registry version (immutable contract; a new version is a new deployment).
pub const VERSION: u32 = 2;

/// Longest allowed chest lifetime: 90 days. `deadline` must satisfy
/// `now < deadline <= now + MAX_DEADLINE` (0 = "never expires" is NOT allowed).
pub const MAX_DEADLINE: u64 = 90 * 24 * 60 * 60;
/// After the deadline the entries stay alive this long so the creator can still `close_chest`.
const CLOSE_GRACE: u64 = 30 * 24 * 60 * 60;
/// Seconds per ledger assumed when converting time to a TTL in ledgers. Real mainnet is ~5s;
/// 4 deliberately over-extends (more ledgers) instead of under-extending.
const LEDGER_SECS: u64 = 4;

/// Wire-compatible con el `Proof` del verificador generado
/// (a: G1 64B, b: G2 128B, c: G1 64B, ethereum-uncompressed).
#[derive(Clone)]
#[contracttype]
pub struct Proof {
    pub a: BytesN<64>,
    pub b: BytesN<128>,
    pub c: BytesN<64>,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct Chest {
    pub creator: Address,
    pub fingerprint: BytesN<32>,
    pub token: Address,
    pub prize: i128,
    pub max_claims: u32,
    pub claims: u32,
    pub deadline: u64,
    pub closed: bool,
    /// Id pushed to the circuit as the `chestId` public input. For a normal
    /// chest it equals the chest id; for chests in a set it is the set id.
    pub group_id: u64,
}

/// This contract is immutable (no upgrade path): changes mean a new deployment.
#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Verifier,
    /// The single token (XLM SAC) this registry accepts, fixed in the constructor.
    Token,
    NextId,
    Chest(u64),
    Nullifier(BytesN<32>),
    /// (group id, recipient) -> true. One claim per address per group. This is NOT sybil
    /// resistance: a person with N fresh addresses (and N player secrets) still claims N times.
    /// It only stops the SAME address from claiming twice in a group.
    Claimed(u64, Address),
    /// set id -> creator. Set ids come from the same counter as chest ids.
    SetOwner(u64),
}

#[contract]
pub struct ChestZk;

#[contractimpl]
impl ChestZk {
    /// Deploy-time initialisation (atomic with deployment: no init front-run window).
    /// `verifier`: Groth16 verifier contract. `token`: the only token chests may hold (XLM SAC).
    pub fn __constructor(env: Env, verifier: Address, token: Address) {
        env.storage().instance().set(&DataKey::Verifier, &verifier);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::NextId, &1u64);
    }

    pub fn verifier(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Verifier).unwrap()
    }

    pub fn token(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Token).unwrap()
    }

    pub fn version(_env: Env) -> u32 {
        VERSION
    }

    fn next_id(env: &Env) -> u64 {
        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap();
        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        id
    }

    /// Allocate a set id (from the same counter as chest ids, so it can never
    /// equal any chest id or any other set id). Only `creator` can add chests.
    pub fn create_set(env: Env, creator: Address) -> Result<u64, Error> {
        creator.require_auth();
        let set_id = Self::next_id(&env);
        let owner_key = DataKey::SetOwner(set_id);
        env.storage().persistent().set(&owner_key, &creator);
        Self::extend_max(&env, &owner_key);
        Self::bump_instance(&env);
        env.events()
            .publish((symbol_short!("set"), set_id), creator);
        Ok(set_id)
    }

    /// Extend an entry to the network max TTL (small entries: nullifiers, claimed flags, set owners).
    fn extend_max(env: &Env, key: &DataKey) {
        let max = env.storage().max_ttl();
        env.storage().persistent().extend_ttl(key, max, max);
    }

    /// Ledgers needed to outlive `deadline` plus CLOSE_GRACE, clamped to the network max TTL.
    fn ttl_past(env: &Env, deadline: u64) -> u32 {
        let secs = deadline
            .saturating_sub(env.ledger().timestamp())
            .saturating_add(CLOSE_GRACE);
        let ledgers = secs / LEDGER_SECS + 1;
        ledgers.min(env.storage().max_ttl() as u64) as u32
    }

    fn bump_instance(env: &Env) {
        let max = env.storage().max_ttl();
        env.storage().instance().extend_ttl(max, max);
    }

    pub fn create_chest(
        env: Env,
        creator: Address,
        fingerprint: BytesN<32>,
        token: Address,
        prize: i128,
        max_claims: u32,
        deadline: u64,
    ) -> Result<u64, Error> {
        Self::create_inner(
            env,
            creator,
            None,
            fingerprint,
            token,
            prize,
            max_claims,
            deadline,
        )
    }

    /// Create a chest inside a set made with `create_set`. All chests of a set
    /// share the nullifier domain: one claim per account per set.
    pub fn create_chest_in_set(
        env: Env,
        creator: Address,
        set_id: u64,
        fingerprint: BytesN<32>,
        token: Address,
        prize: i128,
        max_claims: u32,
        deadline: u64,
    ) -> Result<u64, Error> {
        Self::create_inner(
            env,
            creator,
            Some(set_id),
            fingerprint,
            token,
            prize,
            max_claims,
            deadline,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn create_inner(
        env: Env,
        creator: Address,
        set_id: Option<u64>,
        fingerprint: BytesN<32>,
        token: Address,
        prize: i128,
        max_claims: u32,
        deadline: u64,
    ) -> Result<u64, Error> {
        creator.require_auth();
        if token != Self::token(env.clone()) {
            return Err(Error::WrongToken);
        }
        let now = env.ledger().timestamp();
        if deadline <= now || deadline > now.saturating_add(MAX_DEADLINE) {
            return Err(Error::BadDeadline);
        }
        if let Some(sid) = set_id {
            let owner: Address = env
                .storage()
                .persistent()
                .get(&DataKey::SetOwner(sid))
                .ok_or(Error::SetNotFound)?;
            if owner != creator {
                return Err(Error::NotSetOwner);
            }
            Self::extend_max(&env, &DataKey::SetOwner(sid));
        }
        if prize <= 0 || max_claims == 0 {
            return Err(Error::BadAmounts);
        }
        let total = prize
            .checked_mul(max_claims as i128)
            .ok_or(Error::BadAmounts)?;

        token::Client::new(&env, &token).transfer(
            &creator,
            &env.current_contract_address(),
            &total,
        );

        let id = Self::next_id(&env);

        let chest = Chest {
            creator,
            fingerprint,
            token,
            prize,
            max_claims,
            claims: 0,
            deadline,
            closed: false,
            group_id: set_id.unwrap_or(id),
        };
        let ckey = DataKey::Chest(id);
        env.storage().persistent().set(&ckey, &chest);
        let ttl = Self::ttl_past(&env, chest.deadline);
        env.storage().persistent().extend_ttl(&ckey, ttl, ttl);
        Self::bump_instance(&env);
        env.events().publish(
            (symbol_short!("created"), id),
            (chest.prize, chest.max_claims),
        );
        Ok(id)
    }

    pub fn claim(
        env: Env,
        chest_id: u64,
        recipient: Address,
        nullifier: BytesN<32>,
        proof: Proof,
    ) -> Result<(), Error> {
        let key = DataKey::Chest(chest_id);
        let mut chest: Chest = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ChestNotFound)?;

        if chest.closed {
            return Err(Error::ChestClosed);
        }
        if env.ledger().timestamp() > chest.deadline {
            return Err(Error::ChestExpired);
        }
        if chest.claims >= chest.max_claims {
            return Err(Error::SoldOut);
        }
        if env
            .storage()
            .persistent()
            .has(&DataKey::Nullifier(nullifier.clone()))
        {
            return Err(Error::NullifierUsed);
        }
        // One claim per ADDRESS per group, in addition to the per-secret nullifier.
        // Same address cannot claim twice (same chest, or two chests of one set).
        // This does NOT prevent a person from using fresh addresses (sybil).
        let claimed_key = DataKey::Claimed(chest.group_id, recipient.clone());
        if env.storage().persistent().has(&claimed_key) {
            return Err(Error::AlreadyClaimed);
        }

        // Orden del circuito: [fingerprint, nullifier, chestId, recipient]
        // chestId = group_id (== chest id for normal chests, set id for sets).
        let mut publics: Vec<BytesN<32>> = Vec::new(&env);
        publics.push_back(chest.fingerprint.clone());
        publics.push_back(nullifier.clone());
        publics.push_back(Self::field_from_u64(&env, chest.group_id));
        publics.push_back(Self::field_from_address(&env, &recipient));

        let verifier_addr = Self::verifier(env.clone());
        let args = vec![&env, proof.into_val(&env), publics.into_val(&env)];
        let ok: bool =
            env.invoke_contract(&verifier_addr, &Symbol::new(&env, "verify_proof"), args);
        if !ok {
            env.events()
                .publish((symbol_short!("rejected"), chest_id), nullifier.clone());
            return Err(Error::InvalidProof);
        }

        let nkey = DataKey::Nullifier(nullifier.clone());
        env.storage().persistent().set(&nkey, &chest_id);
        env.storage().persistent().set(&claimed_key, &true);
        Self::extend_max(&env, &nkey);
        Self::extend_max(&env, &claimed_key);
        chest.claims += 1;
        env.storage().persistent().set(&key, &chest);
        let ttl = Self::ttl_past(&env, chest.deadline);
        env.storage().persistent().extend_ttl(&key, ttl, ttl);
        Self::bump_instance(&env);

        token::Client::new(&env, &chest.token).transfer(
            &env.current_contract_address(),
            &recipient,
            &chest.prize,
        );
        env.events().publish(
            (symbol_short!("claimed"), chest_id),
            (recipient, chest.prize),
        );
        Ok(())
    }

    pub fn close_chest(env: Env, chest_id: u64) -> Result<i128, Error> {
        let key = DataKey::Chest(chest_id);
        let mut chest: Chest = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ChestNotFound)?;
        chest.creator.require_auth();

        if chest.closed {
            return Err(Error::ChestClosed);
        }
        let expired = env.ledger().timestamp() > chest.deadline;
        let sold_out = chest.claims >= chest.max_claims;
        if !expired && !sold_out {
            return Err(Error::StillActive);
        }

        let remaining = chest.prize * ((chest.max_claims - chest.claims) as i128);
        // Checks-effects-interactions: persist closed = true BEFORE the token transfer.
        chest.closed = true;
        env.storage().persistent().set(&key, &chest);
        if remaining > 0 {
            token::Client::new(&env, &chest.token).transfer(
                &env.current_contract_address(),
                &chest.creator,
                &remaining,
            );
        }
        env.events()
            .publish((symbol_short!("closed"), chest_id), remaining);
        Ok(remaining)
    }

    pub fn get_chest(env: Env, chest_id: u64) -> Result<Chest, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Chest(chest_id))
            .ok_or(Error::ChestNotFound)
    }

    /// Field element del Address para el circuito.
    /// Spec para el cliente JS: sha256(xdr(Address)) con byte[0]=0.
    /// No es entrypoint (Kuyfi marcaba el export como UNAUTHORIZED_ADDR_CALL).
    pub(crate) fn field_from_address(env: &Env, addr: &Address) -> BytesN<32> {
        let xdr: Bytes = addr.clone().to_xdr(env);
        let hash: BytesN<32> = env.crypto().sha256(&xdr).to_bytes();
        let mut arr = hash.to_array();
        arr[0] = 0;
        BytesN::from_array(env, &arr)
    }

    fn field_from_u64(env: &Env, v: u64) -> BytesN<32> {
        let mut arr = [0u8; 32];
        arr[24..].copy_from_slice(&v.to_be_bytes());
        BytesN::from_array(env, &arr)
    }
}

#[cfg(test)]
mod test;
