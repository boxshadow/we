use std::env;

#[derive(Clone, Debug)]
pub struct VaultConfig {
    pub host: String,
    pub port: u16,
    pub jwt_secret: String,
    pub enforce_https: bool,
    pub max_tx_amount_usdt: f64,
}

impl VaultConfig {
    pub fn from_env() -> Self {
        Self {
            host: env::var("VAULT_HOST").unwrap_or_else(|_| "127.0.0.1".to_string()),
            port: env::var("VAULT_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8550),
            jwt_secret: env::var("VAULT_JWT_SECRET").unwrap_or_else(|_| {
                // 默认共享生产级 JWT 验证密钥 (可与后台配置配对)
                "multichain-kms-super-secret-jwt-key-2026".to_string()
            }),
            enforce_https: env::var("ENFORCE_HTTPS").map(|v| v == "true").unwrap_or(false),
            max_tx_amount_usdt: env::var("MAX_TX_AMOUNT_USDT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(50000.0), // 单笔出金上限风控：5万 USDT
        }
    }
}
