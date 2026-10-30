# ============================================================
# Stage 1: Build binary with Rust official toolchain
# ============================================================
FROM rust:latest AS builder

WORKDIR /usr/src/app

# 安装必要的编译基础工具链
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖清单预热缓存 (加速后续构建)
COPY Cargo.toml Cargo.lock ./

# 创建 dummy main.rs 构建依赖层
RUN mkdir src && echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# 复制真实源码并编译 release 二进制 (触发 profile.release strip/opt-level 优化)
COPY src ./src
RUN touch src/main.rs && cargo build --release

# ============================================================
# Stage 2: Minimal hardened runtime image (< 35MB)
# ============================================================
FROM debian:bookworm-slim AS runtime

# 安装证书与必要基础库
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 创建非 root 安全隔离用户
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/false appuser

WORKDIR /app

# 从构建镜像复制剥离符号的单一静态化二进制
COPY --from=builder /usr/src/app/target/release/multichain-kms-vault /app/multichain-kms-vault

# 权限加固：仅可读可执行，归属 appuser
RUN chown -R appuser:appgroup /app && chmod 755 /app/multichain-kms-vault

# 切换至受限非特权用户
USER appuser

# 默认环境变量
ENV VAULT_HOST=0.0.0.0 \
    VAULT_PORT=8550 \
    RUST_LOG=info \
    ENFORCE_HTTPS=false \
    MAX_TX_AMOUNT_USDT=50000.0

EXPOSE 8550

# 容器健康检查探针
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://127.0.0.1:8550/health || exit 1

ENTRYPOINT ["/app/multichain-kms-vault"]
