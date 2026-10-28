#![cfg(test)]
//! Registry + REAL verifier contract (ceremony wasm, sha256 8df17eda...05b5) + REAL Groth16 proof.
//! No mock verifier here. The proof and its public inputs come from
//! `scripts/gen-real-proof-fixture.mjs` (dummy answer, ceremony zkey, group id 1).

use super::*;
use crate::fixture_real_proof as fx;
use soroban_sdk::{
    Address, BytesN, Env,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
};

const VERIFIER_WASM: &[u8] = include_bytes!("../fixtures/chestzk_verifier_ceremony.wasm");

struct Real<'a> {
    env: Env,
    chest: ChestZkClient<'a>,
    token: TokenClient<'a>,
    creator: Address,
    recipient: Address,
}

fn real<'a>() -> Real<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();
    env.ledger().with_mut(|l| l.timestamp = 1_000);

    let verifier = env.register(VERIFIER_WASM, ());
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let chest_id = env.register(ChestZk, (verifier, sac.address()));
    let creator = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&creator, &1_000_000);
    let recipient = Address::from_str(&env, fx::RECIPIENT);
    Real {
        chest: ChestZkClient::new(&env, &chest_id),
        token: TokenClient::new(&env, &sac.address()),
        creator,
        recipient,
        env,
    }
}

fn proof(env: &Env) -> Proof {
    Proof {
        a: BytesN::from_array(env, &fx::PROOF_A),
        b: BytesN::from_array(env, &fx::PROOF_B),
        c: BytesN::from_array(env, &fx::PROOF_C),
    }
}

fn open(r: &Real, set: Option<u64>) -> u64 {
    let f = BytesN::from_array(&r.env, &fx::FINGERPRINT);
    let deadline = 1_000 + 100_000;
    match set {
        None => r
            .chest
            .create_chest(&r.creator, &f, &r.token.address, &100, &3, &deadline),
        Some(s) => r.chest.create_chest_in_set(
            &r.creator,
            &s,
            &f,
            &r.token.address,
            &100,
            &3,
            &deadline,
        ),
    }
}

fn nullifier(r: &Real) -> BytesN<32> {
    BytesN::from_array(&r.env, &fx::NULLIFIER)
}

#[test]
fn fixture_recipient_field_matches_contract_encoding() {
    let r = real();
    assert_eq!(
        ChestZk::field_from_address(&r.env, &r.recipient).to_array(),
        fx::RECIPIENT_FIELD
    );
}

#[test]
fn real_proof_claims_a_normal_chest() {
    // First id of a fresh registry is 1, and group_id == chest id, so chestId public input = 1.
    let r = real();
    let id = open(&r, None);
    assert_eq!(id, fx::GROUP_ID);
    r.chest
        .claim(&id, &r.recipient, &nullifier(&r), &proof(&r.env));
    assert_eq!(r.token.balance(&r.recipient), 100);
}

#[test]
fn real_proof_claims_a_chest_in_a_set_with_the_set_id() {
    // Set id 1 (first id), chest id 2 with group_id 1: the proof carries chestId = 1 = SET id.
    let r = real();
    let set = r.chest.create_set(&r.creator);
    assert_eq!(set, fx::GROUP_ID);
    let id = open(&r, Some(set));
    assert_eq!(id, 2);
    r.chest
        .claim(&id, &r.recipient, &nullifier(&r), &proof(&r.env));
    assert_eq!(r.token.balance(&r.recipient), 100);
}

#[test]
fn real_proof_for_group_1_is_rejected_on_a_chest_of_another_group() {
    // chest id 2 is a normal chest: group_id 2 != 1, so the chestId public input differs.
    let r = real();
    let _burn_id_1 = r.chest.create_set(&r.creator);
    let id = open(&r, None);
    assert_eq!(id, 2);
    let err = r
        .chest
        .try_claim(&id, &r.recipient, &nullifier(&r), &proof(&r.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::InvalidProof);
    assert_eq!(r.token.balance(&r.recipient), 0);
}

#[test]
fn real_proof_is_bound_to_the_recipient() {
    let r = real();
    let id = open(&r, None);
    let thief = Address::generate(&r.env);
    let err = r
        .chest
        .try_claim(&id, &thief, &nullifier(&r), &proof(&r.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::InvalidProof);
    assert_eq!(r.token.balance(&thief), 0);
}

#[test]
fn real_proof_with_tampered_nullifier_is_rejected() {
    let r = real();
    let id = open(&r, None);
    let mut n = fx::NULLIFIER;
    n[31] ^= 1;
    let err = r
        .chest
        .try_claim(
            &id,
            &r.recipient,
            &BytesN::from_array(&r.env, &n),
            &proof(&r.env),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::InvalidProof);
}

#[test]
fn real_proof_cannot_be_replayed() {
    let r = real();
    let id = open(&r, None);
    let n = nullifier(&r);
    r.chest.claim(&id, &r.recipient, &n, &proof(&r.env));
    let err = r
        .chest
        .try_claim(&id, &r.recipient, &n, &proof(&r.env))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::NullifierUsed);
    assert_eq!(r.token.balance(&r.recipient), 100);
}
