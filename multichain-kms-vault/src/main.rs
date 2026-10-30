use axum::{
    middleware,
    routing::{delete, get, post},
    Router,
};
use std::sync::Arc;
use std::time::Instant;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod auth;
mod config;
mod crypto;
mod handlers;

use auth::jwt_auth_middleware;
use config::VaultConfig;
use crypto::KeyVault;
use handlers::{
    delete_key_handler, health_handler, import_key_handler, list_keys_handler, sign_evm_handler,
    sign_solana_handler, sign_tron_handler, AppState,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. 初始化日志记录器
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 2. 加载配置与初始化安全密钥金库
    let config = VaultConfig::from_env();
    let vault = Arc::new(KeyVault::new());
    let state = AppState {
        vault,
        start_time: Instant::now(),
    };

    println!("=================================================================");
    println!("Web3 自建加密与外部签名微服务 (Rust Native Security Enclave)");
    println!("=================================================================");
    println!("- 运行环境: 原生编译二进制 (Mach-O / ELF Strip-Symbols)");
    println!("- 内存防护: ZeroizeOnDrop 瞬时物理内存覆写已激活");
    println!("- 监听端点: http://{}:{}", config.host, config.port);
    println!("- 签名支持: EVM (Secp256k1) / Solana (Ed25519) / Tron (ECDSA)");
    println!("- 鉴权机制: JWT Bearer Token 双向认证");
    println!("=================================================================\n");

    // 3. 构建公有探针路由与受保护加签路由
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let protected_routes = Router::new()
        .route("/v1/sign/evm", post(sign_evm_handler))
        .route("/v1/sign/solana", post(sign_solana_handler))
        .route("/v1/sign/tron", post(sign_tron_handler))
        .route("/v1/keys", get(list_keys_handler))
        .route("/v1/keys/import", post(import_key_handler))
        .route("/v1/keys/:key_id", delete(delete_key_handler))
        .route_layer(middleware::from_fn(jwt_auth_middleware));

    let app = Router::new()
        .route("/", get(health_handler))
        .route("/health", get(health_handler))
        .merge(protected_routes)
        .layer(cors)
        .with_state(state);

    let addr = format!("{}:{}", config.host, config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("KMS Vault Server running on http://{}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}
