FROM node:22-alpine
WORKDIR /app

# 依赖来自 backend/package.json（仓库根没有 package.json）
COPY backend/package*.json ./
RUN npm install --production

COPY . .
RUN mkdir -p backend/data/media

ENV PORT=3000
EXPOSE 3000
CMD ["node", "backend/server.js"]
