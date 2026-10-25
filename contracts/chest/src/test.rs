#![cfg(test)]

use super::*;
use soroban_sdk::{
    contract as sdk_contract, contractimpl as sdk_contractimpl,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, Vec,
};

// --- Verificador mock, wire-compatible ---

#[sdk_contract]
pub struct MockVerifier;

#[sdk_contractimpl]
impl MockVerifier {
    pub fn set_result(env: Env, ok: bool) {
        env.storage().instance().set(&symbol_short!("ok"), &ok);
    }
    pub fn verify_proof(env: Env, _proof: Proof, _public_inputs: Vec<BytesN<32>>) -> bool {
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

    let mock_id = env.register(MockVerifier, ());
    let chest_id = env.register(ChestZk, ());

    let token_admin_addr = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_admin_addr);
    let token = TokenClient::new(&env, &sac.address());
    let token_admin = StellarAssetClient::new(&env, &sac.address());

    let creator = Address::generate(&env);
    token_admin.mint(&creator, &1_000_000);

    let chest = ChestZkClient::new(&env, &chest_id);
    chest.init(&creator, &mock_id);

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

fn fp(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[7u8; 32])
}

#[test]
fn create_and_claim_pays_prize() {
    let s = setup();
    let id = s
        .chest
        .create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &2, &0);
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
        .create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &2, &0);
    let p1 = Address::generate(&s.env);
    let p2 = Address::generate(&s.env);
    s.chest.claim(&id, &p1, &nul(&s.env, 1), &dummy_proof(&s.env));
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
        .create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &2, &0);
    for i in 1..=2u8 {
        let p = Address::generate(&s.env);
        s.chest.claim(&id, &p, &nul(&s.env, i), &dummy_proof(&s.env));
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
        .create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &1, &0);
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
    s.chest.claim(&id, &p, &nul(&s.env, 1), &dummy_proof(&s.env));

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
fn recipient_field_is_deterministic_and_in_field() {
    let s = setup();
    let p = Address::generate(&s.env);
    let f1 = s.chest.recipient_field(&p);
    let f2 = s.chest.recipient_field(&p);
    assert_eq!(f1, f2);
    assert_eq!(f1.to_array()[0], 0);
    let q = Address::generate(&s.env);
    assert_ne!(s.chest.recipient_field(&q), f1);
}

#[test]
fn bad_amounts_rejected() {
    let s = setup();
    let err = s
        .chest
        .try_create_chest(&s.creator, &fp(&s.env), &s.token.address, &0, &2, &0)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::BadAmounts);
    let err = s
        .chest
        .try_create_chest(&s.creator, &fp(&s.env), &s.token.address, &100, &0, &0)
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
