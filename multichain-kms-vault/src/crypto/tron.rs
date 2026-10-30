use k256::ecdsa::{signature::hazmat::PrehashSigner, SigningKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TronSignRequest {
    pub wallet_address: Option<String>,
    pub key_id: Option<String>,
    pub raw_tx: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TronSignResponse {
    pub success: bool,
    pub signed_tx: serde_json::Value,
    pub algorithm: String,
}

pub fn sign_tron(req: &TronSignRequest, secret_bytes: &[u8]) -> Result<TronSignResponse, String> {
    if secret_bytes.len() != 32 {
        return Err("Invalid Tron private key length, expected 32 bytes".to_string());
    }

    let signing_key = SigningKey::from_slice(secret_bytes)
        .map_err(|e| format!("Failed to load Tron Secp256k1 key: {}", e))?;

    // 1. 获取 rawTx 中的 txID 或 raw_data 计算 SHA-256 摘要
    let tx_val = req
        .raw_tx
        .clone()
        .unwrap_or_else(|| serde_json::json!({ "txID": "tron_mock_tx_id", "signature": [] }));

    let mut hasher = Sha256::new();
    if let Some(raw_data_hex) = tx_val.get("raw_data_hex").and_then(|v| v.as_str()) {
        if let Ok(bytes) = hex::decode(raw_data_hex) {
            hasher.update(&bytes);
        } else {
            hasher.update(raw_data_hex.as_bytes());
        }
    } else {
        hasher.update(tx_val.to_string().as_bytes());
    }
    let digest = hasher.finalize();

    // 2. 执行 ECDSA Secp256k1 签名
    let (signature, recid) = signing_key
        .sign_prehash_recoverable(&digest)
        .map_err(|e| format!("Tron signing failed: {}", e))?;

    // Tron 格式签名: 65 字节 = r (32) + s (32) + v (1)
    let mut sig_bytes = Vec::with_capacity(65);
    sig_bytes.extend_from_slice(&signature.to_bytes());
    sig_bytes.push(recid.to_byte());
    let sig_hex = hex::encode(sig_bytes);

    // 3. 将签名注入到 signed_tx.signature 数组中
    let mut signed_tx = tx_val;
    if let Some(obj) = signed_tx.as_object_mut() {
        obj.insert(
            "signature".to_string(),
            serde_json::json!([sig_hex]),
        );
    }

    Ok(TronSignResponse {
        success: true,
        signed_tx,
        algorithm: "TRON Secp256k1 ECDSA".to_string(),
    })
}
