#![no_std]
//! Cofre NORMAL (sin ZK) — contraparte vulnerable del demo de ataque.
//! La respuesta viaja EN CLARO como argumento de `claim`: cualquiera que lea
//! la tx del ledger la copia y cobra con su propia cuenta.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Bytes,
    BytesN, Env, String,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    ChestNotFound = 1,
    SoldOut = 2,
    AlreadyClaimed = 3,
    WrongAnswer = 4,
    BadAmounts = 5,
    AlreadyInit = 6,
    NotInit = 7,
}

#[derive(Clone)]
#[contracttype]
pub struct Chest {
    pub creator: Address,
    pub answer_hash: BytesN<32>,
    pub prize: i128,
    pub max_claims: u32,
    pub claims: u32,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Token,
    NextId,
    Chest(u32),
    Claimed(u32, Address),
}

#[contract]
pub struct NormalChest;

#[contractimpl]
impl NormalChest {
    pub fn init(env: Env, admin: Address, token: Address) -> Result<(), Error> {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Token) {
            return Err(Error::AlreadyInit);
        }
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::NextId, &1u32);
        Ok(())
    }

    pub fn create_chest(
        env: Env,
        creator: Address,
        prize: i128,
        max_claims: u32,
        answer_hash: BytesN<32>,
    ) -> Result<u32, Error> {
        let token = Self::token(&env)?;
        creator.require_auth();
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

        let id: u32 = env.storage().instance().get(&DataKey::NextId).unwrap();
        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        env.storage().persistent().set(
            &DataKey::Chest(id),
            &Chest {
                creator,
                answer_hash,
                prize,
                max_claims,
                claims: 0,
            },
        );
        env.events()
            .publish((symbol_short!("created"), id), (prize, max_claims));
        Ok(id)
    }

    /// Sin `require_auth` del receptor (igual que el claim ZK, donde envía el
    /// relayer). La respuesta es un argumento visible de la tx.
    pub fn claim(
        env: Env,
        chest_id: u32,
        recipient: Address,
        answer: String,
    ) -> Result<(), Error> {
        let token = Self::token(&env)?;
        let key = DataKey::Chest(chest_id);
        let mut chest: Chest = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ChestNotFound)?;
        if chest.claims >= chest.max_claims {
            return Err(Error::SoldOut);
        }
        let claimed = DataKey::Claimed(chest_id, recipient.clone());
        if env.storage().persistent().has(&claimed) {
            return Err(Error::AlreadyClaimed);
        }
        if Self::hash_answer(&env, &answer) != Some(chest.answer_hash.clone()) {
            return Err(Error::WrongAnswer);
        }

        env.storage().persistent().set(&claimed, &true);
        chest.claims += 1;
        env.storage().persistent().set(&key, &chest);
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &recipient,
            &chest.prize,
        );
        env.events()
            .publish((symbol_short!("claimed"), chest_id), (recipient, chest.prize));
        Ok(())
    }

    pub fn get_chest(env: Env, chest_id: u32) -> Result<Chest, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Chest(chest_id))
            .ok_or(Error::ChestNotFound)
    }

    fn token(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInit)
    }

    /// sha256 de los bytes UTF-8 de la respuesta; None si excede 128 bytes.
    fn hash_answer(env: &Env, answer: &String) -> Option<BytesN<32>> {
        let len = answer.len() as usize;
        let mut buf = [0u8; 128];
        if len > buf.len() {
            return None;
        }
        answer.copy_into_slice(&mut buf[..len]);
        Some(
            env.crypto()
                .sha256(&Bytes::from_slice(env, &buf[..len]))
                .to_bytes(),
        )
    }
}

#[cfg(test)]
mod test;
