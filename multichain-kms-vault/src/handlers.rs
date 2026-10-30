use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde_json::json;
use std::sync::Arc;
use std::time::Instant;

use crate::crypto::{
    sign_evm, sign_solana, sign_tron, EvmSignRequest, KeyVault, SolanaSignRequest,
    TronSignRequest,
};

#[derive(Clone)]
pub struct AppState {
    pub vault: Arc<KeyVault>,
    pub start_time: Instant,
}

/// 健康探针与心跳握手
pub async fn health_handler(State(state): State<AppState>) -> impl IntoResponse {
    let uptime = state.start_time.elapsed().as_secs();
    (
        StatusCode::OK,
        [("x-kms-version", "v3.0.1-rust-native-enclave")],
        Json(json!({
            "status": "ONLINE",
            "version": "v3.0.1-rust-native-enclave",
            "enclaveId": "rust-vault-sgx-0x9f4b",
            "supportedAlgorithms": ["Secp256k1", "Ed25519", "AES-256-GCM"],
            "uptimeSeconds": uptime,
            "memoryProtection": "mlock + zeroize::ZeroizeOnDrop Active",
            "message": "Rust Native Security Vault is operational. Keys isolated in memory.",
        })),
    )
}

/// EVM 交易加签处理器
pub async fn sign_evm_handler(
    State(state): State<AppState>,
    Json(payload): Json<EvmSignRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let addr = payload
        .wallet_address
        .as_deref()
        .or(payload.key_id.as_deref())
        .unwrap_or("evm-default");

    let secret = state
        .vault
        .get_key_or_any_for_chain(addr, "EVM")
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({
                    "success": false,
                    "error": "KEY_NOT_FOUND",
                    "message": format!("Enclave 物理内存中未找到适用于 EVM 的出款私钥 (查找标识: {})", addr),
                })),
            )
        })?;

    let start = Instant::now();
    let res = sign_evm(&payload, &secret.bytes).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "success": false,
                "error": "SIGN_FAILED",
                "message": e,
            })),
        )
    })?;

    tracing::info!(
        "[Rust KMS] EVM Tx signed in {:.3}ms for wallet {}",
        start.elapsed().as_secs_f64() * 1000.0,
        addr
    );

    Ok((StatusCode::OK, Json(res)))
}

/// Solana 交易加签处理器
pub async fn sign_solana_handler(
    State(state): State<AppState>,
    Json(payload): Json<SolanaSignRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let addr = payload
        .wallet_address
        .as_deref()
        .or(payload.key_id.as_deref())
        .unwrap_or("solana-default");

    let secret = state
        .vault
        .get_key_or_any_for_chain(addr, "SOLANA")
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({
                    "success": false,
                    "error": "KEY_NOT_FOUND",
                    "message": format!("Enclave 物理内存中未找到适用于 Solana 的出款私钥 (查找标识: {})", addr),
                })),
            )
        })?;

    let start = Instant::now();
    let res = sign_solana(&payload, &secret.bytes).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "success": false,
                "error": "SIGN_FAILED",
                "message": e,
            })),
        )
    })?;

    tracing::info!(
        "[Rust KMS] Solana Tx signed in {:.3}ms for wallet {}",
        start.elapsed().as_secs_f64() * 1000.0,
        addr
    );

    Ok((StatusCode::OK, Json(res)))
}

/// TRON 交易加签处理器
pub async fn sign_tron_handler(
    State(state): State<AppState>,
    Json(payload): Json<TronSignRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let addr = payload
        .wallet_address
        .as_deref()
        .or(payload.key_id.as_deref())
        .unwrap_or("tron-default");

    let secret = state
        .vault
        .get_key_or_any_for_chain(addr, "TRON")
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({
                    "success": false,
                    "error": "KEY_NOT_FOUND",
                    "message": format!("Enclave 物理内存中未找到适用于 TRON 的出款私钥 (查找标识: {})", addr),
                })),
            )
        })?;

    let start = Instant::now();
    let res = sign_tron(&payload, &secret.bytes).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "success": false,
                "error": "SIGN_FAILED",
                "message": e,
            })),
        )
    })?;

    tracing::info!(
        "[Rust KMS] TRON Tx signed in {:.3}ms for wallet {}",
        start.elapsed().as_secs_f64() * 1000.0,
        addr
    );

    Ok((StatusCode::OK, Json(res)))
}

/// 列出当前 Enclave 内存金库中托管的密钥公开元数据 (绝不返回私钥)
pub async fn list_keys_handler(State(state): State<AppState>) -> impl IntoResponse {
    let keys = state.vault.list_keys();
    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "total": keys.len(),
            "keys": keys,
        })),
    )
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportKeyRequest {
    pub chain: String,
    pub private_key: String,
    pub key_id: Option<String>,
}

/// 安全导入私钥到 Enclave 物理内存中，推导地址并施加 Zeroize 保护
pub async fn import_key_handler(
    State(state): State<AppState>,
    Json(payload): Json<ImportKeyRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let clean = payload.private_key.trim();
    let clean_hex = clean.trim_start_matches("0x");

    // 解析私钥字节 (支持 Hex 与 Base58)
    let key_bytes = if payload.chain.to_uppercase() == "SOLANA" && !clean.starts_with("0x") && clean.len() != 64 {
        bs58::decode(clean)
            .into_vec()
            .map_err(|e| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "success": false,
                        "error": "INVALID_KEY_FORMAT",
                        "message": format!("无法解析 Solana Base58 种子: {}", e)
                    })),
                )
            })?
    } else {
        hex::decode(clean_hex).map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "success": false,
                    "error": "INVALID_HEX",
                    "message": format!("私钥 Hex 格式非法: {}", e)
                })),
            )
        })?
    };

    // 如果是 64 字节 Ed25519 秘钥对，取前 32 字节 seed
    let seed_slice = if key_bytes.len() == 64 && payload.chain.to_uppercase() == "SOLANA" {
        &key_bytes[..32]
    } else {
        &key_bytes[..]
    };

    let metadata = state
        .vault
        .import_key(&payload.chain, seed_slice, payload.key_id)
        .map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "success": false,
                    "error": "IMPORT_FAILED",
                    "message": e
                })),
            )
        })?;

    tracing::info!(
        "[Rust KMS] Successfully imported [{}] key into Enclave: {} (KeyId: {})",
        metadata.chain,
        metadata.address,
        metadata.key_id
    );

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "私钥已成功安全导入 Enclave 物理内存 (ZeroizeOnDrop 保护生效)",
            "key": metadata
        })),
    ))
}

/// 从物理内存中销毁指定密钥 (触发 ZeroizeOnDrop 内存覆写置零)
pub async fn delete_key_handler(
    State(state): State<AppState>,
    Path(key_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    match state.vault.remove_key(&key_id) {
        Ok(meta) => {
            tracing::info!(
                "[Rust KMS] Cryptographically erased key [{}] {} (KeyId: {})",
                meta.chain,
                meta.address,
                meta.key_id
            );
            Ok((
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "message": "密钥已从 Enclave 物理内存中安全销毁并覆写置零 (ZeroizeOnDrop)",
                    "keyId": meta.key_id,
                    "address": meta.address,
                })),
            ))
        }
        Err(e) => Err((
            StatusCode::NOT_FOUND,
            Json(json!({
                "success": false,
                "error": "KEY_NOT_FOUND",
                "message": e,
            })),
        )),
    }
}
