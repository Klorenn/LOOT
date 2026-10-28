#![cfg(test)]

use super::*;
use soroban_sdk::{
    Address, BytesN, Env, Vec, contract as sdk_contract, contractimpl as sdk_contractimpl,
    testutils::{
        Address as _, Ledger,
        storage::{Instance as _, Persistent as _},
    },
    token::{StellarAssetClient, TokenClient},
};

// --- Verificador mock, wire-compatible ---

#[sdk_contract]
pub struct MockVerifier;

#[sdk_contractimpl]
impl MockVerifier {
    pub fn set_result(env: Env, ok: bool) {
        env.storage().instance().set(&symbol_short!("ok"), &ok);
    }
    /// Strict mode: accept only proofs whose public inputs equal `expected`
    /// (models a real verifier binding the proof to its public inputs).
    pub fn set_expected(env: Env, expected: Vec<BytesN<32>>) {
        env.storage()
            .instance()
            .set(&symbol_short!("exp"), &expected);
    }
    pub fn verify_proof(env: Env, _proof: Proof, public_inputs: Vec<BytesN<32>>) -> bool {
        if let Some(exp) = env
            .storage()
            .instance()
            .get::<_, Vec<BytesN<32>>>(&symbol_short!("exp"))
        {
            return exp == public_inputs;
        }
        env.storage()
            .instance()
            .get(&symbol_short!("ok"))
            .unwrap_or(true)
    }
}

struct Setup<'a> {
    env: Env,
    chest: ChestZkClient<'a>,
    mock: MockVerifierClient<'a>,
    token: TokenClient<'a>,
    creator: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();

    env.ledger().with_mut(|l| l.timestamp = 1_000);
    let mock_id = env.register(MockVerifier, ());

    let token_admin_addr = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_admin_addr);
    let chest_id = env.register(ChestZk, (mock_id.clone(), sac.address()));
    let token = TokenClient::new(&env, &sac.address());
    let token_admin = StellarAssetClient::new(&env, &sac.address());

    let creator = Address::generate(&env);
    token_admin.mint(&creator, &1_000_000);

    let chest = ChestZkClient::new(&env, &chest_id);

    Setup {
        chest,
        mock: MockVerifierClient::new(&env, &mock_id),
        token,
        creator,
        env,
    }
}

fn dummy_proof(env: &Env) -> Proof {
    Proof {
        a: BytesN::from_array(env, &[0u8; 64]),
        b: BytesN::from_array(env, &[0u8; 128]),
        c: BytesN::from_array(env, &[0u8; 64]),
    }
}

fn nul(env: &Env, n: u8) -> BytesN<32> {
    let mut a = [0u8; 32];
    a[31] = n;
    BytesN::from_array(env, &a)
}

/// A valid deadline for a chest created at the default test time (1_000).
fn dl(env: &Env) -> u64 {
    env.ledger().timestamp() + 1_000_000
}

fn fp(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[7u8; 32])
}

#[test]
fn create_and_claim_pays_prize() {
    let s = setup();
    let id = s
        .chest
        .create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &2, &dl(&s.env));
    assert_eq!(id, 1);
    assert_eq!(s.token.balance(&s.creator), 1_000_000 - 200);

    let player = Address::generate(&s.env);
    s.chest
        .claim(&id, &player, &nul(&s.env, 1), &dummy_proof(&s.env));
    assert_eq!(s.token.balance(&player), 100);
    assert_eq!(s.chest.get_chest(&id).claims, 1);
}

#[test]
fn nullifier_cannot_be_reused() {
    let s = setup();
    let id = s
        .chest
        .create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &2, &dl(&s.env));
    let p1 = Address::generate(&s.env);
    let p2 = Address::generate(&s.env);
    s.chest
        .claim(&id, &p1, &nul(&s.env, 1), &dummy_proof(&s.env));
    let err = s
        .chest
        .try_claim(&id, &p2, &nul(&s.env, 1), &dummy_proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::NullifierUsed);
}

#[test]
fn sold_out_rejects_more_claims() {
    let s = setup();
    let id = s
        .chest
        .create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &2, &dl(&s.env));
    for i in 1..=2u8 {
        let p = Address::generate(&s.env);
        s.chest
            .claim(&id, &p, &nul(&s.env, i), &dummy_proof(&s.env));
    }
    let p = Address::generate(&s.env);
    let err = s
        .chest
        .try_claim(&id, &p, &nul(&s.env, 3), &dummy_proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::SoldOut);
}

#[test]
fn invalid_proof_is_rejected() {
    let s = setup();
    let id = s
        .chest
        .create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &1, &dl(&s.env));
    s.mock.set_result(&false);
    let p = Address::generate(&s.env);
    let err = s
        .chest
        .try_claim(&id, &p, &nul(&s.env, 1), &dummy_proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::InvalidProof);
    assert_eq!(s.token.balance(&p), 0);
}

#[test]
fn expired_chest_rejects_claims() {
    let s = setup();
    s.env.ledger().with_mut(|l| l.timestamp = 1_000);
    let id = s
        .chest
        .create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &1, &2_000);
    s.env.ledger().with_mut(|l| l.timestamp = 3_000);
    let p = Address::generate(&s.env);
    let err = s
        .chest
        .try_claim(&id, &p, &nul(&s.env, 1), &dummy_proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::ChestExpired);
}

#[test]
fn close_returns_remainder_to_creator() {
    let s = setup();
    s.env.ledger().with_mut(|l| l.timestamp = 1_000);
    let id = s
        .chest
        .create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &3, &2_000);

    let err = s.chest.try_close_chest(&id).unwrap_err().unwrap();
    assert_eq!(err, Error::StillActive);

    let p = Address::generate(&s.env);
    s.chest
        .claim(&id, &p, &nul(&s.env, 1), &dummy_proof(&s.env));

    s.env.ledger().with_mut(|l| l.timestamp = 3_000);
    let remaining = s.chest.close_chest(&id);
    assert_eq!(remaining, 200);
    assert_eq!(s.token.balance(&s.creator), 1_000_000 - 100);

    let p2 = Address::generate(&s.env);
    let err = s
        .chest
        .try_claim(&id, &p2, &nul(&s.env, 2), &dummy_proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::ChestClosed);
    let err = s.chest.try_close_chest(&id).unwrap_err().unwrap();
    assert_eq!(err, Error::ChestClosed);
}

#[test]
fn field_from_address_is_deterministic_and_in_field() {
    let s = setup();
    let p = Address::generate(&s.env);
    let f1 = ChestZk::field_from_address(&s.env, &p);
    let f2 = ChestZk::field_from_address(&s.env, &p);
    assert_eq!(f1, f2);
    assert_eq!(f1.to_array()[0], 0);
    let q = Address::generate(&s.env);
    assert_ne!(ChestZk::field_from_address(&s.env, &q), f1);
}

#[test]
fn bad_amounts_rejected() {
    let s = setup();
    let err = s
        .chest
        .try_create_chest(&s.creator, &fp(&s.env), &s.token.address, &0, &2, &dl(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::BadAmounts);
    let err = s
        .chest
        .try_create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &0, &dl(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::BadAmounts);
}

#[test]
fn unknown_chest_errors() {
    let s = setup();
    let p = Address::generate(&s.env);
    let err = s
        .chest
        .try_claim(&99, &p, &nul(&s.env, 1), &dummy_proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::ChestNotFound);
}

fn field(env: &Env, v: u64) -> BytesN<32> {
    let mut a = [0u8; 32];
    a[24..].copy_from_slice(&v.to_be_bytes());
    BytesN::from_array(env, &a)
}

fn publics(env: &Env, fpr: BytesN<32>, n: BytesN<32>, gid: u64, who: &Address) -> Vec<BytesN<32>> {
    let mut v = Vec::new(env);
    v.push_back(fpr);
    v.push_back(n);
    v.push_back(field(env, gid));
    v.push_back(ChestZk::field_from_address(env, who));
    v
}

fn fp2(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[9u8; 32])
}

#[test]
fn version_is_2() {
    assert_eq!(setup().chest.version(), 2);
}

#[test]
fn single_chest_group_is_chest_id_and_pushes_it() {
    let s = setup();
    let id = s
        .chest
        .create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &1, &dl(&s.env));
    assert_eq!(s.chest.get_chest(&id).group_id, id);
    let p = Address::generate(&s.env);
    let n = nul(&s.env, 1);
    s.mock
        .set_expected(&publics(&s.env, fp(&s.env), n.clone(), id, &p));
    s.chest.claim(&id, &p, &n, &dummy_proof(&s.env));
    assert_eq!(s.token.balance(&p), 100);
}

#[test]
fn set_chests_share_group_and_nullifier() {
    let s = setup();
    let set = s.chest.create_set(&s.creator);
    let a = s.chest.create_chest_in_set(
        &s.creator,
        &set,
        &fp(&s.env),
        &s.token.address,
        &100,
        &5,
        &dl(&s.env),
    );
    let b = s.chest.create_chest_in_set(
        &s.creator,
        &set,
        &fp2(&s.env),
        &s.token.address,
        &100,
        &5,
        &dl(&s.env),
    );
    assert!(set < a && a < b);
    assert_eq!(s.chest.get_chest(&a).group_id, set);
    assert_eq!(s.chest.get_chest(&b).group_id, set);

    let p = Address::generate(&s.env);
    let n = nul(&s.env, 1); // Poseidon(secret, set) is the same for A and B
    s.mock
        .set_expected(&publics(&s.env, fp(&s.env), n.clone(), set, &p));
    s.chest.claim(&a, &p, &n, &dummy_proof(&s.env));

    // same account, other chest of the set: same nullifier -> rejected
    s.mock
        .set_expected(&publics(&s.env, fp2(&s.env), n.clone(), set, &p));
    let err = s
        .chest
        .try_claim(&b, &p, &n, &dummy_proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::NullifierUsed);
    assert_eq!(s.token.balance(&p), 100);
}

#[test]
fn proof_for_chest_a_is_not_replayable_on_chest_b_of_set() {
    let s = setup();
    let set = s.chest.create_set(&s.creator);
    let a = s.chest.create_chest_in_set(
        &s.creator,
        &set,
        &fp(&s.env),
        &s.token.address,
        &100,
        &5,
        &dl(&s.env),
    );
    let b = s.chest.create_chest_in_set(
        &s.creator,
        &set,
        &fp2(&s.env),
        &s.token.address,
        &100,
        &5,
        &dl(&s.env),
    );
    let _ = a;
    let p = Address::generate(&s.env);
    let n = nul(&s.env, 1);
    // verifier only accepts the proof made for A's fingerprint
    s.mock
        .set_expected(&publics(&s.env, fp(&s.env), n.clone(), set, &p));
    let err = s
        .chest
        .try_claim(&b, &p, &n, &dummy_proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::InvalidProof);
    assert_eq!(s.token.balance(&p), 0);
}

#[test]
fn set_proof_with_chest_id_instead_of_group_is_rejected() {
    let s = setup();
    let set = s.chest.create_set(&s.creator);
    let a = s.chest.create_chest_in_set(
        &s.creator,
        &set,
        &fp(&s.env),
        &s.token.address,
        &100,
        &5,
        &dl(&s.env),
    );
    let p = Address::generate(&s.env);
    let n = nul(&s.env, 1);
    s.mock
        .set_expected(&publics(&s.env, fp(&s.env), n.clone(), a, &p));
    let err = s
        .chest
        .try_claim(&a, &p, &n, &dummy_proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::InvalidProof);
}

#[test]
fn only_set_owner_can_add_chests_and_ids_never_collide() {
    let s = setup();
    let set = s.chest.create_set(&s.creator);
    let mallory = Address::generate(&s.env);
    let err = s
        .chest
        .try_create_chest_in_set(&mallory, &set, &fp(&s.env), &s.token.address, &100, &1, &dl(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::NotSetOwner);
    let err = s
        .chest
        .try_create_chest_in_set(
            &s.creator,
            &999,
            &fp(&s.env),
            &s.token.address,
            &100,
            &1,
            &dl(&s.env),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::SetNotFound);

    // a normal chest created by someone else never lands on the set id
    let c = s
        .chest
        .create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &1, &dl(&s.env));
    assert_ne!(c, set);
    assert_eq!(s.chest.get_chest(&c).group_id, c);
    // a set id is not a chest
    assert_eq!(
        s.chest.try_get_chest(&set).unwrap_err().unwrap(),
        Error::ChestNotFound
    );
}

// ---------------------------------------------------------------- hardening

fn mk_in_set(s: &Setup, set: u64, f: BytesN<32>, max_claims: u32) -> u64 {
    s.chest.create_chest_in_set(
        &s.creator,
        &set,
        &f,
        &s.token.address,
        &100,
        &max_claims,
        &dl(&s.env),
    )
}

#[test]
fn constructor_stores_verifier_and_token() {
    // There is no `init` entrypoint: the constructor runs atomically at deploy time,
    // so there is no front-run window and it can never run twice.
    let s = setup();
    assert_eq!(s.chest.token(), s.token.address);
    assert_eq!(s.chest.verifier(), s.mock.address);
}

#[test]
fn same_recipient_cannot_claim_twice_in_same_chest() {
    let s = setup();
    let id = s.chest.create_chest(
        &s.creator,
        &fp(&s.env),
        &s.token.address,
        &100,
        &3,
        &dl(&s.env),
    );
    let p = Address::generate(&s.env);
    s.chest
        .claim(&id, &p, &nul(&s.env, 1), &dummy_proof(&s.env));
    // different player secret (fresh nullifier), SAME recipient address
    let err = s
        .chest
        .try_claim(&id, &p, &nul(&s.env, 2), &dummy_proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::AlreadyClaimed);
    assert_eq!(s.token.balance(&p), 100);
}

#[test]
fn same_recipient_cannot_claim_in_two_chests_of_same_set() {
    let s = setup();
    let set = s.chest.create_set(&s.creator);
    let a = mk_in_set(&s, set, fp(&s.env), 5);
    let b = mk_in_set(&s, set, fp2(&s.env), 5);
    let p = Address::generate(&s.env);
    s.chest
        .claim(&a, &p, &nul(&s.env, 1), &dummy_proof(&s.env));
    let err = s
        .chest
        .try_claim(&b, &p, &nul(&s.env, 2), &dummy_proof(&s.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::AlreadyClaimed);
    assert_eq!(s.token.balance(&p), 100);
}

#[test]
fn fresh_addresses_still_claim_sybil_is_not_prevented() {
    // Documents the limit: Claimed only blocks the SAME address.
    let s = setup();
    let id = s.chest.create_chest(
        &s.creator,
        &fp(&s.env),
        &s.token.address,
        &100,
        &3,
        &dl(&s.env),
    );
    let p1 = Address::generate(&s.env);
    let p2 = Address::generate(&s.env);
    s.chest
        .claim(&id, &p1, &nul(&s.env, 1), &dummy_proof(&s.env));
    s.chest
        .claim(&id, &p2, &nul(&s.env, 2), &dummy_proof(&s.env));
    assert_eq!(s.chest.get_chest(&id).claims, 2);
}

#[test]
fn same_recipient_can_claim_in_different_groups() {
    let s = setup();
    let c1 = s.chest.create_chest(
        &s.creator,
        &fp(&s.env),
        &s.token.address,
        &100,
        &3,
        &dl(&s.env),
    );
    let c2 = s.chest.create_chest(
        &s.creator,
        &fp2(&s.env),
        &s.token.address,
        &100,
        &3,
        &dl(&s.env),
    );
    let p = Address::generate(&s.env);
    s.chest
        .claim(&c1, &p, &nul(&s.env, 1), &dummy_proof(&s.env));
    s.chest
        .claim(&c2, &p, &nul(&s.env, 2), &dummy_proof(&s.env));
    assert_eq!(s.token.balance(&p), 200);
}

#[test]
fn deadline_must_be_in_the_future_and_within_max() {
    let s = setup();
    let now = s.env.ledger().timestamp();
    let mk = |d: u64| {
        s.chest
            .try_create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &1, &d)
    };
    for bad in [0, now - 1, now, now + MAX_DEADLINE + 1] {
        assert_eq!(mk(bad).unwrap_err().unwrap(), Error::BadDeadline, "{bad}");
    }
    // boundaries: now + 1 and now + MAX_DEADLINE are valid
    mk(now + 1).unwrap().unwrap();
    mk(now + MAX_DEADLINE).unwrap().unwrap();
    // same rule for set chests
    let set = s.chest.create_set(&s.creator);
    let err = s
        .chest
        .try_create_chest_in_set(
            &s.creator,
            &set,
            &fp(&s.env),
            &s.token.address,
            &100,
            &1,
            &0,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::BadDeadline);
}

#[test]
fn bad_deadline_moves_no_funds() {
    let s = setup();
    let before = s.token.balance(&s.creator);
    let _ = s
        .chest
        .try_create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &1, &0);
    assert_eq!(s.token.balance(&s.creator), before);
}

fn ttl_of(s: &Setup, key: &DataKey) -> u32 {
    s.env.as_contract(&s.chest.address, || {
        s.env.storage().persistent().get_ttl(key)
    })
}

#[test]
fn ttl_of_chest_outlives_its_deadline_and_claim_entries_get_max() {
    let s = setup();
    let now = s.env.ledger().timestamp();
    let deadline = now + MAX_DEADLINE;
    let id = s.chest.create_chest(
        &s.creator,
        &fp(&s.env),
        &s.token.address,
        &100,
        &2,
        &deadline,
    );
    let max = s.env.storage().max_ttl();
    // ledgers are ~5s: TTL (ledgers) * 5s must cover the deadline plus the close grace
    let ttl = ttl_of(&s, &DataKey::Chest(id));
    assert!(
        ttl as u64 * 5 >= MAX_DEADLINE + CLOSE_GRACE,
        "chest ttl {ttl}"
    );
    assert!(ttl <= max);
    let inst_ttl = s.env.as_contract(&s.chest.address, || {
        s.env.storage().instance().get_ttl()
    });
    assert!(inst_ttl > 1_000_000, "instance ttl {inst_ttl}");

    let p = Address::generate(&s.env);
    let n = nul(&s.env, 1);
    s.chest.claim(&id, &p, &n, &dummy_proof(&s.env));
    assert_eq!(ttl_of(&s, &DataKey::Nullifier(n)), max);
    assert_eq!(ttl_of(&s, &DataKey::Claimed(id, p)), max);
    assert!(ttl_of(&s, &DataKey::Chest(id)) as u64 * 5 >= MAX_DEADLINE + CLOSE_GRACE - 5);
}

#[test]
fn ttl_is_clamped_to_network_max() {
    let s = setup();
    s.env.ledger().with_mut(|l| l.max_entry_ttl = 100_000);
    let id = s.chest.create_chest(
        &s.creator,
        &fp(&s.env),
        &s.token.address,
        &100,
        &1,
        &(s.env.ledger().timestamp() + MAX_DEADLINE),
    );
    assert_eq!(ttl_of(&s, &DataKey::Chest(id)), 100_000 - 1);
}

#[test]
fn close_chest_marks_closed_and_pays_back_once() {
    // Checks-effects-interactions: `closed` is persisted before the transfer. The host forbids
    // contract re-entry anyway, so the observable guarantees are: final state is closed, the
    // refund is paid exactly once, and a second close fails without moving funds.
    let s = setup();
    let id = s.chest.create_chest(
        &s.creator,
        &fp(&s.env),
        &s.token.address,
        &100,
        &3,
        &dl(&s.env),
    );
    let t = dl(&s.env) + 1;
    s.env.ledger().with_mut(|l| l.timestamp = t);
    assert_eq!(s.chest.close_chest(&id), 300);
    assert!(s.chest.get_chest(&id).closed);
    let bal = s.token.balance(&s.creator);
    assert_eq!(
        s.chest.try_close_chest(&id).unwrap_err().unwrap(),
        Error::ChestClosed
    );
    assert_eq!(s.token.balance(&s.creator), bal);
}

#[test]
fn only_the_fixed_token_is_accepted() {
    let s = setup();
    let other_admin = Address::generate(&s.env);
    let other = s.env.register_stellar_asset_contract_v2(other_admin);
    StellarAssetClient::new(&s.env, &other.address()).mint(&s.creator, &1_000);
    let err = s
        .chest
        .try_create_chest(
            &s.creator,
            &fp(&s.env),
            &other.address(),
            &100,
            &1,
            &dl(&s.env),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::WrongToken);
    let set = s.chest.create_set(&s.creator);
    let err = s
        .chest
        .try_create_chest_in_set(
            &s.creator,
            &set,
            &fp(&s.env),
            &other.address(),
            &100,
            &1,
            &dl(&s.env),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::WrongToken);
    assert_eq!(
        TokenClient::new(&s.env, &other.address()).balance(&s.creator),
        1_000
    );
}
