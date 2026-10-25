#![cfg(test)]
//! Factory + chest tests. The chest is deployed from its real wasm
//! (build first: `cd ../chest-one && stellar contract build`).
//! The Groth16 verifier is mocked but checks ALL four public inputs the chest sends
//! (fingerprint, nullifier, chestId, recipient), so copy/replay behaviour is real.

extern crate std;
use super::*;
use soroban_sdk::{
    contract as sdk_contract, contractimpl as sdk_contractimpl, symbol_short,
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
    vec as svec, xdr::ToXdr, Address, Bytes, BytesN, Env, IntoVal, String, Symbol, Vec,
};

mod chest_wasm {
    soroban_sdk::contractimport!(
        file = "../chest-one/target/wasm32v1-none/release/chestzk_chest_one.wasm"
    );
}
use chest_wasm::{Client as ChestC, Error as ChestErr, Proof};

const XLM: i128 = 10_000_000;
const DAY: u64 = 86_400;
const T0: u64 = 1_000_000;

// ---------------------------------------------------------------- mocks

#[sdk_contract]
pub struct MockVerifier;

#[sdk_contractimpl]
impl MockVerifier {
    /// The proof is "valid" only for exactly these public inputs.
    pub fn expect(
        env: Env,
        fingerprint: BytesN<32>,
        nullifier: BytesN<32>,
        chest_field: BytesN<32>,
        recipient_field: BytesN<32>,
    ) {
        let v: Vec<BytesN<32>> = svec![&env, fingerprint, nullifier, chest_field, recipient_field];
        env.storage().instance().set(&symbol_short!("pubs"), &v);
    }
    pub fn set_trap(env: Env, trap: bool) {
        env.storage().instance().set(&symbol_short!("trap"), &trap);
    }
    pub fn verify_proof(env: Env, _proof: Proof, publics: Vec<BytesN<32>>) -> bool {
        if env.storage().instance().get(&symbol_short!("trap")).unwrap_or(false) {
            panic!("malformed proof");
        }
        let v: Vec<BytesN<32>> = env.storage().instance().get(&symbol_short!("pubs")).unwrap();
        publics == v
    }
}

/// Minimal token whose transfers TO `blocked` panic (a treasury that cannot receive).
#[sdk_contract]
pub struct MockToken;

#[sdk_contractimpl]
impl MockToken {
    pub fn set_blocked(env: Env, who: Address) {
        env.storage().instance().set(&symbol_short!("blocked"), &who);
    }
    pub fn mint(env: Env, to: Address, amount: i128) {
        let b = Self::balance(env.clone(), to.clone());
        env.storage().persistent().set(&to, &(b + amount));
    }
    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().persistent().get(&id).unwrap_or(0)
    }
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        let blocked: Option<Address> = env.storage().instance().get(&symbol_short!("blocked"));
        if blocked == Some(to.clone()) {
            panic!("blocked recipient");
        }
        let fb = Self::balance(env.clone(), from.clone());
        assert!(fb >= amount, "insufficient");
        env.storage().persistent().set(&from, &(fb - amount));
        let tb = Self::balance(env.clone(), to.clone());
        env.storage().persistent().set(&to, &(tb + amount));
    }
}

fn field(env: &Env, a: &Address) -> BytesN<32> {
    let xdr: Bytes = a.clone().to_xdr(env);
    let mut arr = env.crypto().sha256(&xdr).to_bytes().to_array();
    arr[0] = 0;
    BytesN::from_array(env, &arr)
}

struct S<'a> {
    env: Env,
    factory: ChestFactoryClient<'a>,
    factory_addr: Address,
    verifier: MockVerifierClient<'a>,
    token: TokenClient<'a>,
    creator: Address,
    treasury: Address,
    admin: Address,
}

fn setup<'a>() -> S<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = T0);
    let wasm_hash = env.deployer().upload_contract_wasm(chest_wasm::WASM);

    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let token = TokenClient::new(&env, &sac.address());
    let creator = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&creator, &(1_000 * XLM));

    let verifier_addr = env.register(MockVerifier, ());
    let treasury = Address::generate(&env);
    let admin = Address::generate(&env);
    let factory_addr = env.register(
        ChestFactory,
        (
            admin.clone(),
            treasury.clone(),
            wasm_hash,
            verifier_addr.clone(),
            sac.address(),
            5 * XLM,
            10u32,
            30u32,
        ),
    );
    S {
        factory: ChestFactoryClient::new(&env, &factory_addr),
        factory_addr,
        verifier: MockVerifierClient::new(&env, &verifier_addr),
        token,
        creator,
        treasury,
        admin,
        env,
    }
}

fn fp(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[7u8; 32])
}
fn nul(env: &Env, n: u8) -> BytesN<32> {
    let mut a = [0u8; 32];
    a[31] = n;
    BytesN::from_array(env, &a)
}
fn proof(env: &Env) -> Proof {
    Proof {
        a: BytesN::from_array(env, &[0u8; 64]),
        b: BytesN::from_array(env, &[0u8; 128]),
        c: BytesN::from_array(env, &[0u8; 64]),
    }
}

fn sched(env: &Env, v: &[i128]) -> Vec<i128> {
    let mut out = Vec::new(env);
    for x in v {
        out.push_back(*x);
    }
    out
}

/// Equal-prize chest: `slots` places of `amount` each (the convenience path).
fn new_chest<'a>(s: &'a S, amount: i128, slots: u32, days: u32) -> (Address, ChestC<'a>) {
    let v = std::vec![amount; slots as usize];
    new_chest_prizes(s, &v, days)
}

/// Podium / tiered chest: place k (claim order) pays prizes[k].
fn new_chest_prizes<'a>(s: &'a S, prizes: &[i128], days: u32) -> (Address, ChestC<'a>) {
    let q = String::from_str(&s.env, "Cuantos bits tiene un byte?");
    let addr = s
        .factory
        .create_chest(&s.creator, &q, &fp(&s.env), &sched(&s.env, prizes), &days);
    let c = ChestC::new(&s.env, &addr);
    (addr, c)
}

/// A proof is valid only for (fingerprint fp, nullifier n, this chest, this recipient).
fn approve_n(s: &S, chest: &Address, recipient: &Address, n: u8) {
    s.verifier.expect(
        &fp(&s.env),
        &nul(&s.env, n),
        &field(&s.env, chest),
        &field(&s.env, recipient),
    );
}
fn approve(s: &S, chest: &Address, recipient: &Address) {
    approve_n(s, chest, recipient, 1);
}

fn advance(s: &S, secs: u64) {
    s.env.ledger().with_mut(|l| l.timestamp += secs);
}

/// Prepaid reserve / fee for `days`: simple (not compounded), on the INITIAL prize.
fn fee_on(prize: i128, bps: i128, days: u32) -> i128 {
    prize * bps * (days as i128) / 10_000
}

/// Accounting invariant: chest token balance == prize_pool + fee_reserve,
/// and the factory never holds funds.
fn check_invariant(s: &S, addr: &Address, c: &ChestC) {
    let i = c.get_info();
    assert_eq!(s.token.balance(addr), i.prize_pool + i.fee_reserve);
    assert_eq!(c.balance(), i.prize_pool + i.fee_reserve);
    assert_eq!(s.token.balance(&s.factory_addr), 0);
}

// ---------------------------------------------------------------- create / claim

#[test]
fn create_funds_chest_and_pays_creation_fee_to_treasury() {
    let s = setup();
    let (addr, c) = new_chest(&s, 10 * XLM, 3, 7);
    let reserve = fee_on(30 * XLM, 10, 7);
    assert_eq!(reserve, 2_100_000); // 0.21 XLM

    assert_eq!(s.token.balance(&addr), 30 * XLM + reserve);
    assert_eq!(s.token.balance(&s.treasury), 5 * XLM);
    assert_eq!(s.token.balance(&s.creator), 1_000 * XLM - 35 * XLM - reserve);
    assert_eq!(s.token.balance(&s.factory_addr), 0);

    let info = c.get_info();
    assert_eq!(info.creator, s.creator);
    assert_eq!(info.slots, 3);
    assert_eq!(info.prizes, sched(&s.env, &[10 * XLM, 10 * XLM, 10 * XLM]));
    assert_eq!(info.daily_fee_bps, 10);
    assert_eq!(info.expiry, T0 + 7 * DAY);
    assert_eq!(info.prize_pool, 30 * XLM);
    assert_eq!(info.fee_reserve, reserve);
    assert!(!info.closed);
    check_invariant(&s, &addr, &c);

    assert_eq!(s.factory.chest_count(), 1);
    let list = s.factory.list_chests(&0, &10);
    assert_eq!(list.len(), 1);
    assert_eq!(list.get(0).unwrap(), addr);
    let (addr2, _) = new_chest(&s, XLM, 1, 1);
    assert_ne!(addr, addr2);
    assert_eq!(s.factory.list_chests(&1, &10).len(), 1);
    // limit is capped (50) and never panics on huge values
    assert_eq!(s.factory.list_chests(&0, &u32::MAX).len(), 2);
    assert_eq!(s.token.balance(&s.factory_addr), 0);
}

#[test]
fn create_chest_requires_creator_auth_over_both_transfers() {
    let s = setup();
    let _ = new_chest(&s, 10 * XLM, 2, 7);
    // recorded auth tree: ONE root entry for the creator (create_chest) whose
    // sub-invocations are the two token transfers (creation fee + prize/reserve).
    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, s.creator);
    assert_eq!(auths[0].1.sub_invocations.len(), 2);
}

#[test]
fn valid_claim_pays_recipient() {
    let s = setup();
    let (addr, c) = new_chest(&s, 10 * XLM, 2, 7);
    let player = Address::generate(&s.env);
    approve(&s, &addr, &player);
    c.claim(&player, &nul(&s.env, 1), &proof(&s.env));
    assert_eq!(s.token.balance(&player), 10 * XLM);
    assert_eq!(c.get_info().claims, 1);
    assert_eq!(c.get_info().prize_pool, 10 * XLM);
    check_invariant(&s, &addr, &c);
}

#[test]
fn copied_proof_with_other_recipient_is_invalid() {
    let s = setup();
    let (addr, c) = new_chest(&s, 10 * XLM, 2, 7);
    let honest = Address::generate(&s.env);
    let thief = Address::generate(&s.env);
    approve(&s, &addr, &honest); // proof generated for `honest`
    let err = c
        .try_claim(&thief, &nul(&s.env, 1), &proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ChestErr::InvalidProof);
    assert_eq!(s.token.balance(&thief), 0);
    assert_eq!(c.get_info().claims, 0);
}

#[test]
fn proof_for_another_nullifier_is_invalid() {
    let s = setup();
    let (addr, c) = new_chest(&s, 10 * XLM, 2, 7);
    let p = Address::generate(&s.env);
    approve_n(&s, &addr, &p, 1);
    let err = c
        .try_claim(&p, &nul(&s.env, 2), &proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ChestErr::InvalidProof);
}

#[test]
fn proof_for_another_chest_is_invalid() {
    let s = setup();
    let (a1, _c1) = new_chest(&s, 10 * XLM, 2, 7);
    let (_a2, c2) = new_chest(&s, 10 * XLM, 2, 7);
    let p = Address::generate(&s.env);
    approve(&s, &a1, &p);
    let err = c2
        .try_claim(&p, &nul(&s.env, 1), &proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ChestErr::InvalidProof);
}

#[test]
fn malformed_proof_that_traps_the_verifier_is_invalid_proof_not_a_panic() {
    let s = setup();
    let (addr, c) = new_chest(&s, 10 * XLM, 2, 7);
    let p = Address::generate(&s.env);
    approve(&s, &addr, &p);
    s.verifier.set_trap(&true);
    let err = c
        .try_claim(&p, &nul(&s.env, 1), &proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ChestErr::InvalidProof);
}

#[test]
fn repeated_nullifier_rejected() {
    let s = setup();
    let (addr, c) = new_chest(&s, 10 * XLM, 3, 7);
    let p = Address::generate(&s.env);
    approve(&s, &addr, &p);
    c.claim(&p, &nul(&s.env, 1), &proof(&s.env));
    let err = c
        .try_claim(&p, &nul(&s.env, 1), &proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ChestErr::NullifierUsed);
}

#[test]
fn no_slots_left() {
    let s = setup();
    let (addr, c) = new_chest(&s, 10 * XLM, 1, 7);
    let p = Address::generate(&s.env);
    approve(&s, &addr, &p);
    c.claim(&p, &nul(&s.env, 1), &proof(&s.env));
    let err = c
        .try_claim(&p, &nul(&s.env, 2), &proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ChestErr::SoldOut);
}

// ---------------------------------------------------------------- close / refunds

#[test]
fn close_refunds_unclaimed_prize_and_full_unused_reserve() {
    let s = setup();
    let (addr, c) = new_chest(&s, 10 * XLM, 3, 7);
    let reserve = fee_on(30 * XLM, 10, 7);
    let p = Address::generate(&s.env);
    approve(&s, &addr, &p);
    c.claim(&p, &nul(&s.env, 1), &proof(&s.env));
    let before = s.token.balance(&s.creator);
    let refund = c.close();
    assert_eq!(refund, 20 * XLM + reserve); // no day elapsed: nothing charged
    assert_eq!(s.token.balance(&s.creator), before + refund);
    assert_eq!(c.balance(), 0);
    assert!(c.get_info().closed);
    let err = c
        .try_claim(&p, &nul(&s.env, 2), &proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ChestErr::ChestClosed);
    assert_eq!(c.try_close().unwrap_err().unwrap(), ChestErr::ChestClosed);
    assert_eq!(s.token.balance(&s.factory_addr), 0);
}

#[test]
fn early_close_refunds_unused_reserve() {
    let s = setup();
    let (_addr, c) = new_chest(&s, 10 * XLM, 10, 30);
    let prize = 100 * XLM;
    let reserve = fee_on(prize, 10, 30);
    let t_before = s.token.balance(&s.treasury);
    let creator_before = s.token.balance(&s.creator);
    advance(&s, 10 * DAY + 5);
    let refund = c.close();
    let fee10 = fee_on(prize, 10, 10);
    assert_eq!(refund, prize + reserve - fee10);
    assert_eq!(s.token.balance(&s.treasury), t_before + fee10);
    assert_eq!(s.token.balance(&s.creator), creator_before + refund);
    assert_eq!(s.token.balance(&s.factory_addr), 0);
}

#[test]
fn factory_close_forwards() {
    let s = setup();
    let (addr, _c) = new_chest(&s, 10 * XLM, 2, 7);
    let reserve = fee_on(20 * XLM, 10, 7);
    assert_eq!(s.factory.close(&addr), 20 * XLM + reserve);
}

#[test]
fn close_before_expiry_is_creator_only_after_expiry_anyone() {
    let s = setup();
    let (addr, c) = new_chest(&s, 10 * XLM, 2, 2);
    let (addr2, c2) = new_chest(&s, 10 * XLM, 2, 2);
    let no_args: Vec<soroban_sdk::Val> = Vec::new(&s.env);

    // enforce auth from here on (nobody signs)
    s.env.mock_auths(&[]);
    assert!(c.try_close().is_err(), "stranger cannot close before expiry");

    // the creator signs close -> works
    s.env.mock_auths(&[MockAuth {
        address: &s.creator,
        invoke: &MockAuthInvoke {
            contract: &addr,
            fn_name: "close",
            args: no_args,
            sub_invokes: &[],
        },
    }]);
    assert!(c.close() > 0);

    // after expiry anyone can close (no auth at all); refund still goes to the creator
    advance(&s, 3 * DAY);
    s.env.mock_auths(&[]);
    let before = s.token.balance(&s.creator);
    let refund = c2.close();
    assert!(refund > 0);
    assert_eq!(s.token.balance(&s.creator), before + refund);
    assert_eq!(s.token.balance(&addr2), 0);
}

// ---------------------------------------------------------------- fees

#[test]
fn accrue_after_n_days_takes_fee_only_from_reserve() {
    let s = setup();
    let (addr, c) = new_chest(&s, 10 * XLM, 10, 30);
    let prize = 100 * XLM;
    let reserve = fee_on(prize, 10, 30);
    let t_before = s.token.balance(&s.treasury);
    advance(&s, 10 * DAY + 123); // 10 full days
    let fee = c.accrue_fees();
    assert_eq!(fee, fee_on(prize, 10, 10));
    assert_eq!(fee, XLM); // 100 XLM * 0.1% * 10 days
    assert_eq!(s.token.balance(&s.treasury), t_before + fee);
    let i = c.get_info();
    assert_eq!(i.prize_pool, prize); // prize untouched
    assert_eq!(i.fee_reserve, reserve - fee);
    assert_eq!(i.last_fee_ts, T0 + 10 * DAY);
    check_invariant(&s, &addr, &c);
    assert_eq!(c.accrue_fees(), 0);
    advance(&s, DAY - 200); // < 1 day more
    assert_eq!(c.accrue_fees(), 0);
}

#[test]
fn claim_charges_fee_before_paying_prize() {
    let s = setup();
    let (addr, c) = new_chest(&s, 10 * XLM, 10, 30);
    let p = Address::generate(&s.env);
    approve(&s, &addr, &p);
    let t_before = s.token.balance(&s.treasury);
    advance(&s, 5 * DAY);
    c.claim(&p, &nul(&s.env, 1), &proof(&s.env));
    let fee = fee_on(100 * XLM, 10, 5);
    assert_eq!(s.token.balance(&s.treasury), t_before + fee);
    assert_eq!(s.token.balance(&p), 10 * XLM);
    assert_eq!(c.get_info().prize_pool, 90 * XLM);
    check_invariant(&s, &addr, &c);
}

#[test]
fn last_winner_gets_exactly_amount_per_slot_after_many_days_of_fees() {
    let s = setup();
    let (addr, c) = new_chest(&s, 10 * XLM, 3, 30);
    let reserve = fee_on(30 * XLM, 10, 30);
    let treasury_start = s.token.balance(&s.treasury);
    for (i, day) in [0u64, 10, 29].iter().enumerate() {
        s.env.ledger().with_mut(|l| l.timestamp = T0 + day * DAY + 1);
        let p = Address::generate(&s.env);
        approve_n(&s, &addr, &p, i as u8 + 1);
        c.claim(&p, &nul(&s.env, i as u8 + 1), &proof(&s.env));
        assert_eq!(s.token.balance(&p), 10 * XLM); // exactly, never reduced by fees
        check_invariant(&s, &addr, &c);
    }
    assert_eq!(c.get_info().prize_pool, 0);
    let charged = s.token.balance(&s.treasury) - treasury_start;
    assert_eq!(charged, fee_on(30 * XLM, 10, 29));
    assert!(charged <= reserve);
}

#[test]
fn fee_never_exceeds_reserve() {
    let s = setup();
    let (addr, c) = new_chest(&s, 7 * XLM + 3, 3, 30);
    let prize = (7 * XLM + 3) * 3;
    let reserve = fee_on(prize, 10, 30);
    let t_before = s.token.balance(&s.treasury);
    advance(&s, 90 * DAY); // way past expiry
    let fee = c.accrue_fees();
    assert!(fee <= reserve);
    assert_eq!(s.token.balance(&s.treasury), t_before + fee);
    assert_eq!(c.get_info().fee_reserve, reserve - fee);
    assert_eq!(c.get_info().prize_pool, prize);
    assert_eq!(c.accrue_fees(), 0); // nothing more accrues after expiry
    check_invariant(&s, &addr, &c);
}

#[test]
fn expiry_blocks_claims_and_close_refunds_unclaimed_plus_leftover_reserve() {
    let s = setup();
    let (addr, c) = new_chest(&s, 10 * XLM, 10, 2);
    let p = Address::generate(&s.env);
    approve(&s, &addr, &p);
    c.claim(&p, &nul(&s.env, 1), &proof(&s.env)); // 1 of 10 claimed at day 0
    advance(&s, 5 * DAY); // way past the 2-day duration
    let err = c
        .try_claim(&p, &nul(&s.env, 2), &proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ChestErr::ChestExpired);

    let creator_before = s.token.balance(&s.creator);
    let t_before = s.token.balance(&s.treasury);
    let reserve = fee_on(100 * XLM, 10, 2);
    let refund = c.close();
    let fee = fee_on(100 * XLM, 10, 2); // accrual stops at expiry (2 days)
    assert_eq!(refund, 90 * XLM + (reserve - fee));
    assert_eq!(s.token.balance(&s.creator), creator_before + refund);
    assert_eq!(s.token.balance(&s.treasury), t_before + fee);
    assert_eq!(s.token.balance(&s.factory_addr), 0);
}

#[test]
fn failing_treasury_cannot_block_claim_or_close() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = T0);
    let wasm_hash = env.deployer().upload_contract_wasm(chest_wasm::WASM);
    let tok_addr = env.register(MockToken, ());
    let tok = MockTokenClient::new(&env, &tok_addr);
    let treasury = Address::generate(&env);
    tok.set_blocked(&treasury); // any transfer to the treasury panics
    let creator = Address::generate(&env);
    tok.mint(&creator, &(1_000 * XLM));
    let verifier_addr = env.register(MockVerifier, ());
    let verifier = MockVerifierClient::new(&env, &verifier_addr);
    let factory_addr = env.register(
        ChestFactory,
        (
            Address::generate(&env),
            treasury.clone(),
            wasm_hash,
            verifier_addr,
            tok_addr.clone(),
            0i128, // creation fee 0, otherwise create itself could not pay the treasury
            10u32,
            30u32,
        ),
    );
    let factory = ChestFactoryClient::new(&env, &factory_addr);
    let q = String::from_str(&env, "q");
    let chest = factory.create_chest(
        &creator,
        &q,
        &fp(&env),
        &sched(&env, &[10 * XLM, 10 * XLM, 10 * XLM]),
        &10,
    );
    let c = ChestC::new(&env, &chest);
    let reserve = fee_on(30 * XLM, 10, 10);
    assert_eq!(c.get_info().fee_reserve, reserve);

    advance_env(&env, 5 * DAY);
    let p = Address::generate(&env);
    verifier.expect(&fp(&env), &nul(&env, 1), &field(&env, &chest), &field(&env, &p));
    c.claim(&p, &nul(&env, 1), &proof(&env)); // fee transfer fails -> skipped, claim still pays
    assert_eq!(tok.balance(&p), 10 * XLM);
    let i = c.get_info();
    assert_eq!(i.fee_reserve, reserve); // fee stayed in the reserve
    assert_eq!(i.last_fee_ts, T0); // and will be retried

    let before = tok.balance(&creator);
    let refund = c.close(); // can always exit
    assert_eq!(refund, 20 * XLM + reserve);
    assert_eq!(tok.balance(&creator), before + refund);
    assert_eq!(tok.balance(&treasury), 0);
}

fn advance_env(env: &Env, secs: u64) {
    env.ledger().with_mut(|l| l.timestamp += secs);
}

// ---------------------------------------------------------------- init / admin

#[test]
fn chest_init_rejected_if_not_called_by_factory() {
    let s = setup();
    let (addr, c) = new_chest(&s, 10 * XLM, 2, 7);
    let attacker = Address::generate(&s.env);
    let before = c.get_info();
    let init = chest_wasm::ChestInit {
        creator: attacker.clone(),
        verifier: attacker.clone(),
        token: attacker.clone(),
        treasury: attacker.clone(),
        question: String::from_str(&s.env, "pwned"),
        fingerprint: fp(&s.env),
        prizes: sched(&s.env, &[1]),
        duration_days: 1,
        daily_fee_bps: 0,
        fee_reserve: 0,
    };
    let args = svec![&s.env, init.into_val(&s.env)];
    let r = s.env.try_invoke_contract::<(), soroban_sdk::Error>(
        &addr,
        &Symbol::new(&s.env, "__constructor"),
        args,
    );
    assert!(r.is_err(), "__constructor must not be callable directly");
    let after = c.get_info();
    assert_eq!(after.creator, before.creator);
    assert_eq!(after.question, before.question);
}

#[test]
fn duration_bounds_and_bad_amounts() {
    let s = setup();
    let q = String::from_str(&s.env, "q");
    for d in [0u32, 31] {
        let e = s
            .factory
            .try_create_chest(&s.creator, &q, &fp(&s.env), &sched(&s.env, &[XLM]), &d)
            .unwrap_err()
            .unwrap();
        assert_eq!(e, Error::BadDuration);
    }
    assert_eq!(s.factory.chest_count(), 0);
}

#[test]
fn set_fees_is_admin_only_and_chests_copy_fees() {
    let s = setup();
    let (_a1, c1) = new_chest(&s, 10 * XLM, 1, 5);
    s.factory.set_fees(&(2 * XLM), &100u32, &10u32);
    let auths = s.env.auths();
    assert_eq!(auths[0].0, s.admin);

    let cfg = s.factory.get_config();
    assert_eq!(cfg.creation_fee, 2 * XLM);
    assert_eq!(cfg.daily_fee_bps, 100);
    assert_eq!(cfg.max_duration_days, 10);

    assert_eq!(c1.get_info().daily_fee_bps, 10); // old chest unchanged
    let (_a2, c2) = new_chest(&s, 10 * XLM, 1, 5);
    assert_eq!(c2.get_info().daily_fee_bps, 100);
    assert_eq!(s.token.balance(&s.treasury), 7 * XLM);
    let q = String::from_str(&s.env, "q");
    let e = s
        .factory
        .try_create_chest(&s.creator, &q, &fp(&s.env), &sched(&s.env, &[XLM]), &11)
        .unwrap_err()
        .unwrap();
    assert_eq!(e, Error::BadDuration);
    assert_eq!(s.token.balance(&s.factory_addr), 0);
}

#[test]
fn daily_fee_bps_is_capped_at_100() {
    let s = setup();
    let e = s
        .factory
        .try_set_fees(&XLM, &101u32, &30u32)
        .unwrap_err()
        .unwrap();
    assert_eq!(e, Error::BadFees);
    s.factory.set_fees(&XLM, &100u32, &30u32);
}

#[test]
fn admin_only_setters_need_admin_auth() {
    let s = setup();
    let new_treasury = Address::generate(&s.env);
    let new_hash = BytesN::from_array(&s.env, &[9u8; 32]);

    s.env.mock_auths(&[]); // nobody signs
    assert!(s.factory.try_set_fees(&0, &10u32, &30u32).is_err());
    assert!(s.factory.try_set_treasury(&new_treasury).is_err());
    assert!(s.factory.try_set_chest_wasm(&new_hash).is_err());
    assert!(s.factory.try_propose_admin(&new_treasury).is_err());

    // a non-admin signing is not enough
    s.env.mock_auths(&[MockAuth {
        address: &s.creator,
        invoke: &MockAuthInvoke {
            contract: &s.factory_addr,
            fn_name: "set_treasury",
            args: svec![&s.env, new_treasury.clone().into_val(&s.env)],
            sub_invokes: &[],
        },
    }]);
    assert!(s.factory.try_set_treasury(&new_treasury).is_err());

    // admin signs -> works
    s.env.mock_auths(&[MockAuth {
        address: &s.admin,
        invoke: &MockAuthInvoke {
            contract: &s.factory_addr,
            fn_name: "set_treasury",
            args: svec![&s.env, new_treasury.clone().into_val(&s.env)],
            sub_invokes: &[],
        },
    }]);
    s.factory.set_treasury(&new_treasury);
    assert_eq!(s.factory.get_config().treasury, new_treasury);

    s.env.mock_auths(&[MockAuth {
        address: &s.admin,
        invoke: &MockAuthInvoke {
            contract: &s.factory_addr,
            fn_name: "set_chest_wasm",
            args: svec![&s.env, new_hash.clone().into_val(&s.env)],
            sub_invokes: &[],
        },
    }]);
    s.factory.set_chest_wasm(&new_hash);
    assert_eq!(s.factory.get_config().chest_wasm_hash, new_hash);
}

#[test]
fn two_step_admin_handover() {
    let s = setup();
    let new_admin = Address::generate(&s.env);
    assert_eq!(
        s.factory.try_accept_admin().unwrap_err().unwrap(),
        Error::NoPendingAdmin
    );
    s.factory.propose_admin(&new_admin);
    assert_eq!(s.factory.get_config().admin, s.admin); // not yet
    s.factory.accept_admin();
    assert_eq!(s.env.auths()[0].0, new_admin); // the proposed admin had to sign
    assert_eq!(s.factory.get_config().admin, new_admin);
    assert_eq!(
        s.factory.try_accept_admin().unwrap_err().unwrap(),
        Error::NoPendingAdmin
    );
}

// ---------------------------------------------------------------- podium / tiered prizes

#[test]
fn podium_each_place_receives_exactly_its_amount_then_sold_out() {
    let s = setup();
    let tiers = [50 * XLM, 20 * XLM, 10 * XLM];
    let (addr, c) = new_chest_prizes(&s, &tiers, 30);
    let reserve = fee_on(80 * XLM, 10, 30); // reserve is computed on the SUM
    assert_eq!(c.get_info().fee_reserve, reserve);
    assert_eq!(c.get_info().prize_pool, 80 * XLM);
    assert_eq!(s.token.balance(&addr), 80 * XLM + reserve);
    assert_eq!(c.next_prize(), Some((1, 50 * XLM)));

    for (i, amt) in tiers.iter().enumerate() {
        // fees accrue between claims; tiers must stay exact
        s.env.ledger().with_mut(|l| l.timestamp = T0 + (i as u64 * 7) * DAY + 1);
        let p = Address::generate(&s.env);
        approve_n(&s, &addr, &p, i as u8 + 1);
        c.claim(&p, &nul(&s.env, i as u8 + 1), &proof(&s.env));
        assert_eq!(s.token.balance(&p), *amt, "place {}", i + 1);
        check_invariant(&s, &addr, &c);
    }
    assert_eq!(c.get_info().claims, 3);
    assert_eq!(c.get_info().prize_pool, 0);
    assert_eq!(c.next_prize(), None);

    // 4th claim -> SoldOut
    let p4 = Address::generate(&s.env);
    approve_n(&s, &addr, &p4, 4);
    let err = c
        .try_claim(&p4, &nul(&s.env, 4), &proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, ChestErr::SoldOut);
}

#[test]
fn podium_next_prize_tracks_the_claim_order() {
    let s = setup();
    let (addr, c) = new_chest_prizes(&s, &[50 * XLM, 20 * XLM, 10 * XLM], 7);
    assert_eq!(c.next_prize(), Some((1, 50 * XLM)));
    let p = Address::generate(&s.env);
    approve_n(&s, &addr, &p, 1);
    c.claim(&p, &nul(&s.env, 1), &proof(&s.env));
    assert_eq!(c.next_prize(), Some((2, 20 * XLM)));
    assert_eq!(c.get_info().claims, 1);
}

#[test]
fn podium_refund_after_one_claim_is_unpaid_tiers_plus_leftover_reserve() {
    let s = setup();
    let (addr, c) = new_chest_prizes(&s, &[50 * XLM, 20 * XLM, 10 * XLM], 30);
    let reserve = fee_on(80 * XLM, 10, 30);
    let p = Address::generate(&s.env);
    approve_n(&s, &addr, &p, 1);
    c.claim(&p, &nul(&s.env, 1), &proof(&s.env));
    assert_eq!(s.token.balance(&p), 50 * XLM);

    advance(&s, 10 * DAY + 5);
    let before = s.token.balance(&s.creator);
    let t_before = s.token.balance(&s.treasury);
    let refund = c.close();
    let fee10 = fee_on(80 * XLM, 10, 10);
    assert_eq!(refund, 30 * XLM + (reserve - fee10)); // unpaid 20+10 plus unused reserve
    assert_eq!(s.token.balance(&s.creator), before + refund);
    assert_eq!(s.token.balance(&s.treasury), t_before + fee10);
    assert_eq!(s.token.balance(&s.factory_addr), 0);
}

#[test]
fn podium_fees_never_touch_tiers_even_after_expiry() {
    let s = setup();
    let (addr, c) = new_chest_prizes(&s, &[5 * XLM + 1, 3 * XLM + 7, 2 * XLM + 3], 5);
    let sum = (5 * XLM + 1) + (3 * XLM + 7) + (2 * XLM + 3);
    advance(&s, 40 * DAY);
    c.accrue_fees();
    assert_eq!(c.get_info().prize_pool, sum);
    check_invariant(&s, &addr, &c);
    // last place still gets its exact tier if it were claimable; here chest expired:
    let p = Address::generate(&s.env);
    approve_n(&s, &addr, &p, 1);
    assert_eq!(
        c.try_claim(&p, &nul(&s.env, 1), &proof(&s.env)).unwrap_err().unwrap(),
        ChestErr::ChestExpired
    );
}

#[test]
fn invalid_schedules_are_rejected() {
    let s = setup();
    let q = String::from_str(&s.env, "q");
    let try_it = |v: Vec<i128>| {
        s.factory
            .try_create_chest(&s.creator, &q, &fp(&s.env), &v, &5)
            .unwrap_err()
            .unwrap()
    };
    // empty
    assert_eq!(try_it(sched(&s.env, &[])), Error::BadSchedule);
    // more than 50 places
    assert_eq!(try_it(sched(&s.env, &std::vec![XLM; 51])), Error::BadSchedule);
    // zero / negative tier anywhere
    assert_eq!(try_it(sched(&s.env, &[XLM, 0, XLM])), Error::BadSchedule);
    assert_eq!(try_it(sched(&s.env, &[XLM, -5])), Error::BadSchedule);
    // sum overflow
    assert_eq!(try_it(sched(&s.env, &[i128::MAX, 1])), Error::BadAmounts);
    assert_eq!(s.factory.chest_count(), 0);
    assert_eq!(s.token.balance(&s.factory_addr), 0);
}

#[test]
fn fifty_places_is_accepted_and_equal_prizes_still_work() {
    let s = setup();
    let (_a, c) = new_chest_prizes(&s, &std::vec![XLM; 50], 3);
    assert_eq!(c.get_info().slots, 50);
    assert_eq!(c.get_info().prize_pool, 50 * XLM);
    let (_b, c2) = new_chest(&s, 7 * XLM, 4, 3); // convenience path
    assert_eq!(c2.get_info().prizes, sched(&s.env, &[7 * XLM; 4]));
}
