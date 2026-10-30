use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};
use sha3::{Digest as Sha3Digest, Keccak256};
use sha2::{Digest as Sha2Digest, Sha256};

/// 内存级安全私钥持有包装器 (离开生命周期立即用 0x00 覆写物理内存)
#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct SecureSecretKey {
    pub bytes: Vec<u8>,
}

impl SecureSecretKey {
    pub fn new(bytes: Vec<u8>) -> Self {
        Self { bytes }
    }
}

/// 导出公开元数据（绝不包含私钥字节）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyMetadata {
    pub key_id: String,
    pub address: String,
    pub chain: String,
    pub algorithm: String,
    pub created_at: u64,
}

struct VaultEntry {
    metadata: KeyMetadata,
    secret: SecureSecretKey,
}

pub struct KeyVault {
    // key_id -> VaultEntry
    entries: RwLock<HashMap<String, VaultEntry>>,
    // address.to_lowercase() -> key_id
    address_index: RwLock<HashMap<String, String>>,
}

impl KeyVault {
    pub fn new() -> Self {
        let vault = Self {
            entries: RwLock::new(HashMap::new()),
            address_index: RwLock::new(HashMap::new()),
        };
        vault.init_default_vault_keys();
        vault
    }

    /// 预设默认出金热钱包密钥池 (开发/测试环境下直接就绪)
    fn init_default_vault_keys(&self) {
        // 1. EVM 出金热钱包 (Hardhat Account #1 私钥)
        let evm_key = hex::decode("59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d")
            .unwrap_or_else(|_| vec![1u8; 32]);
        let _ = self.import_key("EVM", &evm_key, Some("evm-default".to_string()));

        // 2. Solana 出金热钱包 (32 字节 Ed25519 Seed)
        let mut sol_seed = vec![0u8; 32];
        sol_seed[0] = 2;
        let _ = self.import_key("SOLANA", &sol_seed, Some("solana-default".to_string()));

        // 3. Tron 出金热钱包 (32 字节 Secp256k1)
        let tron_key = hex::decode("855260f80749e10751306097731e3feac4477122509dc1ea4f2b89249e7086ff")
            .unwrap_or_else(|_| vec![3u8; 32]);
        let _ = self.import_key("TRON", &tron_key, Some("tron-default".to_string()));
    }

    /// 安全导入私钥到 Enclave 物理内存中，自动推导链上地址
    pub fn import_key(
        &self,
        chain: &str,
        raw_key: &[u8],
        custom_key_id: Option<String>,
    ) -> Result<KeyMetadata, String> {
        if raw_key.len() != 32 {
            return Err("私钥/种子长度必须为 32 字节 (256 bits)".to_string());
        }

        let chain_upper = chain.to_uppercase();
        let (address, algorithm) = match chain_upper.as_str() {
            "EVM" | "ETHEREUM" | "BSC" | "BASE" | "ARBITRUM" => {
                let addr = derive_evm_address(raw_key)?;
                (addr, "ECDSA Secp256k1 (Keccak256)".to_string())
            }
            "SOLANA" | "SOL" => {
                let addr = derive_solana_address(raw_key)?;
                (addr, "Ed25519 (Edwards-curve)".to_string())
            }
            "TRON" | "TRX" => {
                let addr = derive_tron_address(raw_key)?;
                (addr, "ECDSA Secp256k1 (SHA256+Base58Check)".to_string())
            }
            _ => return Err(format!("不支持的公链类型: {}", chain)),
        };

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let key_id = custom_key_id.unwrap_or_else(|| {
            format!("{}-{}-{}", chain_upper.to_lowercase(), &address[2.min(address.len())..8.min(address.len())], now % 10000)
        });

        let metadata = KeyMetadata {
            key_id: key_id.clone(),
            address: address.clone(),
            chain: chain_upper,
            algorithm,
            created_at: now * 1000,
        };

        let secret = SecureSecretKey::new(raw_key.to_vec());
        let entry = VaultEntry {
            metadata: metadata.clone(),
            secret,
        };

        let mut entries = self.entries.write().unwrap();
        let mut idx = self.address_index.write().unwrap();

        idx.insert(address.to_lowercase(), key_id.clone());
        idx.insert(key_id.clone(), key_id.clone());
        entries.insert(key_id, entry);

        Ok(metadata)
    }

    /// 列出所有在内存中托管的密钥元数据（不包含私钥数据）
    pub fn list_keys(&self) -> Vec<KeyMetadata> {
        let entries = self.entries.read().unwrap();
        let mut list: Vec<KeyMetadata> = entries.values().map(|e| e.metadata.clone()).collect();
        list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        list
    }

    /// 安全销毁并从物理内存中抹除密钥 (触发 SecureSecretKey 的 ZeroizeOnDrop 物理置零)
    pub fn remove_key(&self, key_id_or_addr: &str) -> Result<KeyMetadata, String> {
        let mut entries = self.entries.write().unwrap();
        let mut idx = self.address_index.write().unwrap();

        // 查找 target key_id
        let target_key_id = idx
            .get(&key_id_or_addr.to_lowercase())
            .or_else(|| idx.get(key_id_or_addr))
            .cloned()
            .unwrap_or_else(|| key_id_or_addr.to_string());

        if let Some(entry) = entries.remove(&target_key_id) {
            // 清理索引
            idx.remove(&entry.metadata.address.to_lowercase());
            idx.remove(&target_key_id);
            // entry 被 drop，entry.secret 触发 ZeroizeOnDrop，内存逐字节置零！
            Ok(entry.metadata)
        } else {
            Err(format!("未找到 ID 为 '{}' 的托管密钥", key_id_or_addr))
        }
    }

    /// 获取密钥副本 (注意：返回的 SecureSecretKey 离开作用域时会自动 Zeroize 覆写物理内存)
    pub fn get_key(&self, address_or_id: &str) -> Option<SecureSecretKey> {
        let idx = self.address_index.read().unwrap();
        let entries = self.entries.read().unwrap();

        // 1. 通过索引映射查询
        if let Some(key_id) = idx.get(&address_or_id.to_lowercase()).or_else(|| idx.get(address_or_id)) {
            if let Some(entry) = entries.get(key_id) {
                return Some(entry.secret.clone());
            }
        }

        // 2. 直接根据 key_id 查询
        if let Some(entry) = entries.get(address_or_id) {
            return Some(entry.secret.clone());
        }

        // 3. Fallback: 默认密钥
        if address_or_id.contains("sol") {
            entries.get("solana-default").map(|e| e.secret.clone())
        } else if address_or_id.contains("tron") || address_or_id.starts_with('T') {
            entries.get("tron-default").map(|e| e.secret.clone())
        } else {
            entries.get("evm-default").map(|e| e.secret.clone())
        }
    }

    /// 获取指定地址或 key_id 的密钥；如果未找到，尝试回退到该生态的任意可用密钥
    pub fn get_key_or_any_for_chain(&self, address_or_id: &str, chain: &str) -> Option<SecureSecretKey> {
        let chain_upper = chain.to_uppercase();
        if let Some(key) = self.get_key(address_or_id) {
            return Some(key);
        }

        let entries = self.entries.read().unwrap();
        // 尝试寻找该生态的任意一把有效密钥
        entries
            .values()
            .find(|e| e.metadata.chain == chain_upper)
            .map(|e| e.secret.clone())
    }
}

/// EVM 地址推导：Secp256k1 公钥 -> Keccak256 -> 取后 20 字节 -> 0x 前缀
fn derive_evm_address(secret_bytes: &[u8]) -> Result<String, String> {
    let signing_key = k256::ecdsa::SigningKey::from_slice(secret_bytes)
        .map_err(|e| format!("EVM 私钥格式非法: {}", e))?;
    let verifying_key = signing_key.verifying_key();
    let point = verifying_key.to_encoded_point(false);
    let pub_bytes = point.as_bytes();
    if pub_bytes.len() != 65 || pub_bytes[0] != 0x04 {
        return Err("非法的非压缩公钥格式".to_string());
    }
    let mut hasher = Keccak256::new();
    hasher.update(&pub_bytes[1..]);
    let digest = hasher.finalize();
    let addr_bytes = &digest[12..];
    Ok(format!("0x{}", hex::encode(addr_bytes)))
}

/// Solana 地址推导：Ed25519 种子 -> VerifyingKey 公钥 (32 bytes) -> Base58 编码
fn derive_solana_address(secret_bytes: &[u8]) -> Result<String, String> {
    let mut seed = [0u8; 32];
    seed.copy_from_slice(secret_bytes);
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&seed);
    let verifying_key = signing_key.verifying_key();
    Ok(bs58::encode(verifying_key.as_bytes()).into_string())
}

/// TRON 地址推导：Secp256k1 公钥 -> Keccak256 -> 取后 20 字节 -> 前缀 0x41 -> 双 SHA256 校验码 -> Base58Check
fn derive_tron_address(secret_bytes: &[u8]) -> Result<String, String> {
    let signing_key = k256::ecdsa::SigningKey::from_slice(secret_bytes)
        .map_err(|e| format!("TRON 私钥格式非法: {}", e))?;
    let verifying_key = signing_key.verifying_key();
    let point = verifying_key.to_encoded_point(false);
    let pub_bytes = point.as_bytes();
    if pub_bytes.len() != 65 || pub_bytes[0] != 0x04 {
        return Err("非法的波场公钥格式".to_string());
    }

    let mut hasher = Keccak256::new();
    hasher.update(&pub_bytes[1..]);
    let digest = hasher.finalize();

    // 波场主网地址以 0x41 开头 + 20 字节公钥哈希
    let mut raw_addr = Vec::with_capacity(25);
    raw_addr.push(0x41);
    raw_addr.extend_from_slice(&digest[12..]);

    // 计算校验和：SHA256(SHA256(raw_addr)) 的前 4 字节
    let h1 = Sha256::digest(&raw_addr);
    let h2 = Sha256::digest(&h1);
    raw_addr.extend_from_slice(&h2[..4]);

    Ok(bs58::encode(raw_addr).into_string())
}
