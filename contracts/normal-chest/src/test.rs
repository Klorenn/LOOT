#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Bytes, BytesN, Env, String,
};

struct Setup<'a> {
    env: Env,
    chest: NormalChestClient<'a>,
    token: TokenClient<'a>,
    creator: Address,
    answer_hash: BytesN<32>,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let token = TokenClient::new(&env, &sac.address());
    let creator = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&creator, &1_000_000);

    let chest = NormalChestClient::new(&env, &env.register(NormalChest, ()));
    chest.init(&creator, &sac.address());

    let answer_hash = env.crypto().sha256(&Bytes::from_slice(&env, b"8")).to_bytes();
    Setup { env, chest, token, creator, answer_hash }
}

fn open<'a>(s: &Setup<'a>, max_claims: u32) -> u32 {
    s.chest.create_chest(&s.creator, &100, &max_claims, &s.answer_hash)
}

#[test]
fn right_answer_pays() {
    let s = setup();
    let id = open(&s, 3);
    let who = Address::generate(&s.env);
    s.chest.claim(&id, &who, &String::from_str(&s.env, "8"));
    assert_eq!(s.token.balance(&who), 100);
    assert_eq!(s.chest.get_chest(&id).claims, 1);
}

#[test]
fn create_escrows_prize_times_slots() {
    let s = setup();
    open(&s, 3);
    assert_eq!(s.token.balance(&s.creator), 1_000_000 - 300);
}

#[test]
fn wrong_answer_fails() {
    let s = setup();
    let id = open(&s, 3);
    let who = Address::generate(&s.env);
    let r = s.chest.try_claim(&id, &who, &String::from_str(&s.env, "9"));
    assert_eq!(r, Err(Ok(Error::WrongAnswer)));
    assert_eq!(s.token.balance(&who), 0);
}

#[test]
fn oversized_answer_fails() {
    let s = setup();
    let id = open(&s, 3);
    let who = Address::generate(&s.env);
    let long = String::from_str(&s.env, &"x".repeat(200));
    assert_eq!(s.chest.try_claim(&id, &who, &long), Err(Ok(Error::WrongAnswer)));
}

#[test]
fn sold_out_fails() {
    let s = setup();
    let id = open(&s, 1);
    let a = String::from_str(&s.env, "8");
    s.chest.claim(&id, &Address::generate(&s.env), &a);
    let r = s.chest.try_claim(&id, &Address::generate(&s.env), &a);
    assert_eq!(r, Err(Ok(Error::SoldOut)));
}

#[test]
fn same_recipient_twice_fails() {
    let s = setup();
    let id = open(&s, 3);
    let who = Address::generate(&s.env);
    let a = String::from_str(&s.env, "8");
    s.chest.claim(&id, &who, &a);
    assert_eq!(s.chest.try_claim(&id, &who, &a), Err(Ok(Error::AlreadyClaimed)));
    assert_eq!(s.token.balance(&who), 100);
}

/// LA VULNERABILIDAD del demo: la respuesta copiada de la primera tx
/// sirve para que OTRA cuenta cobre otro slot.
#[test]
fn copied_answer_pays_second_recipient() {
    let s = setup();
    let id = open(&s, 3);
    let player = Address::generate(&s.env);
    let bot = Address::generate(&s.env);
    let a = String::from_str(&s.env, "8");
    s.chest.claim(&id, &player, &a);
    s.chest.claim(&id, &bot, &a);
    assert_eq!(s.token.balance(&bot), 100);
}

#[test]
fn unknown_chest_fails() {
    let s = setup();
    let r = s.chest.try_claim(&99, &Address::generate(&s.env), &String::from_str(&s.env, "8"));
    assert_eq!(r, Err(Ok(Error::ChestNotFound)));
}

#[test]
fn bad_amounts_fail() {
    let s = setup();
    assert_eq!(
        s.chest.try_create_chest(&s.creator, &0, &3, &s.answer_hash),
        Err(Ok(Error::BadAmounts))
    );
    assert_eq!(
        s.chest.try_create_chest(&s.creator, &100, &0, &s.answer_hash),
        Err(Ok(Error::BadAmounts))
    );
}
