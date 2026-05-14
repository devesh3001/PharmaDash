# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY customer-app/package*.json ./customer-app/
RUN cd customer-app && npm install
COPY customer-app/ ./customer-app/
RUN cd customer-app && npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install
COPY backend/ ./backend/
RUN cd backend && npx prisma generate
RUN cd backend && npm run build

# Stage 3: Production Image
FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app

# Copy built backend
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/package*.json ./backend/
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/prisma ./backend/prisma

# Copy built frontend (to be served by backend)
COPY --from=frontend-builder /app/customer-app/dist ./customer-app/dist

WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/index.js"]
