# ─── Multi-Stage Build ────────────────────────────────────────────────────────

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/customer-app
COPY customer-app/package*.json ./
RUN npm install
COPY customer-app/ ./
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npx prisma generate
RUN npm run build

# Stage 3: Production Image
FROM node:20-alpine
WORKDIR /app

# Copy built backend
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/package*.json ./backend/
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/prisma ./backend/prisma

# Copy built frontend (to be served by backend)
COPY --from=frontend-builder /app/customer-app/dist ./customer-app/dist

WORKDIR /app/backend
EXPOSE 8080

ENV NODE_ENV=production
CMD ["npm", "start"]
