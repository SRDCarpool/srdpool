# SRDPool — one container serves the API, WebSockets and the built app.
# Build:  docker build -t srdpool .
# Run:    docker run -p 8080:8080 -v srdpool-data:/data --env-file .env srdpool

FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
# SQLite database lives here — mount a persistent volume.
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
