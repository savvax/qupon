# Isolated worker box for unattended agents (pi has no permission system; Claude's bypass mode is for containers).
# Build: docker build -t qupon-worker -f ops/Dockerfile .   Run: docker run -it --env-file .env -v $PWD:/work -v ~/.claude:/root/.claude -v ~/.config/qupon:/root/.config/qupon qupon-worker
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive PATH="/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:/usr/local/go/bin:/root/go/bin:${PATH}"
RUN apt-get update && apt-get install -y build-essential pkg-config libssl-dev libudev-dev llvm libclang-dev protobuf-compiler curl git jq tmux ca-certificates libxml2-utils sudo && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && rustup update stable
RUN sh -c "$(curl -sSfL https://release.anza.xyz/v4.3.0/install)"
RUN cargo install --git https://github.com/otter-sec/anchor avm --force && avm install 1.2.0 && avm use 1.2.0
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs && corepack enable && corepack prepare pnpm@9 --activate
RUN curl -fsSL https://go.dev/dl/go1.25.1.linux-amd64.tar.gz | tar -C /usr/local -xz
RUN npm install -g @earendil-works/pi-coding-agent @anthropic-ai/claude-code
RUN curl --proto '=https' --tlsv1.2 -sSfL https://run.surfpool.run/ | bash || true
WORKDIR /work
CMD ["bash"]
