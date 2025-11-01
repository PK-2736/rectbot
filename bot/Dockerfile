# Build and run rectbot with canvas support
FROM node:20-bookworm-slim

# Install native deps for canvas
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY bot/package.json ./
COPY bot/package-lock.json ./
RUN npm ci

COPY bot/. .

ENV NODE_ENV=production
CMD ["node", "src/index.js"]
