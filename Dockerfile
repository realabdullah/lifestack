# Stage 1: Build & Dependencies
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy the application source code
COPY index.js ./

# Stage 2: Production Runner
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built artifacts/files from builder
COPY --from=builder /usr/src/app/index.js ./

# Run as non-root user for safety
USER node

EXPOSE 3000

CMD ["node", "index.js"]
