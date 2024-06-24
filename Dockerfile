FROM --platform=amd64 node:20 AS BackendBuilder
WORKDIR /workspace
COPY . .
RUN yarn
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
RUN PATH=$HOME/.cargo/bin:$PATH && \
    yarn workspace @affine/native build
RUN PATH=$HOME/.cargo/bin:$PATH && \
    yarn workspace @affine/server-native build
RUN yarn workspace @affine/server build
RUN yarn workspace @affine/server prisma generate

FROM --platform=amd64 node:20 AS WebBuilder
WORKDIR /workspace
COPY . .
RUN yarn
ENV BUILD_TYPE stable
ENV SHOULD_REPORT_TRACE false
ENV PUBLIC_PATH /
ENV SELF_HOSTED true
RUN yarn nx build @affine/web --skip-nx-cache

FROM --platform=amd64 node:20 AS WebAdminBuilder
WORKDIR /workspace
COPY . .
RUN yarn
ENV BUILD_TYPE stable
ENV SHOULD_REPORT_TRACE false
ENV PUBLIC_PATH /admin/
ENV SELF_HOSTED true
RUN yarn nx build @affine/admin --skip-nx-cache

FROM node:20-bookworm-slim as runtime
WORKDIR /app
COPY --from=BackendBuilder /workspace/packages/backend/server /app
COPY --from=BackendBuilder /workspace/packages/backend/native/server-native.node /app
COPY --from=WebBuilder /workspace/packages/frontend/web/dist /app/static
COPY --from=WebAdminBuilder /workspace/packages/frontend/admin/dist /app/static/admin
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*
CMD ["node", "--import", "./scripts/register.js", "./dist/index.js"]