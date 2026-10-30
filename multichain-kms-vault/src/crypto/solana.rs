use base64::prelude::*;
use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaSignRequest {
    pub wallet_address: Option<String>,
    pub key_id: Option<String>,
    pub raw_message_base64: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaSignResponse {
    pub success: bool,
    pub signature_base64: String,
    pub algorithm: String,
    pub public_key: String,
}

pub fn sign_solana(
    req: &SolanaSignRequest,
    seed_bytes: &[u8],
) -> Result<SolanaSignResponse, String> {
    if seed_bytes.len() != 32 {
        return Err("Invalid Solana seed length, expected 32 bytes".to_string());
    }

    let mut key_bytes = [0u8; 32];
    key_bytes.copy_from_slice(seed_bytes);
    let signing_key = SigningKey::from_bytes(&key_bytes);

    // 1. 解析 Base64 编码的 Message 载荷
    let message_bytes = if let Some(ref b64) = req.raw_message_base64 {
        BASE64_STANDARD
            .decode(b64)
            .map_err(|e| format!("Invalid base64 raw message: {}", e))?
    } else {
        b"mock_solana_serialized_message_for_signing".to_vec()
    };

    // 2. 执行 Ed25519 签名
    let signature = signing_key.sign(&message_bytes);
    let signature_base64 = BASE64_STANDARD.encode(signature.to_bytes());
    let pubkey_base58 = bs58::encode(signing_key.verifying_key().as_bytes()).into_string();

    Ok(SolanaSignResponse {
        success: true,
        signature_base64,
        algorithm: "Ed25519 (ed25519-dalek)".to_string(),
        public_key: pubkey_base58,
    })
}
