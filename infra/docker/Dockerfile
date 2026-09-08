FROM node:24-bookworm-slim AS dependencies
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS source
COPY . .

FROM source AS web-build
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM runtime AS web
ENV WRANGLER_LOG_PATH=/app/.wrangler/wrangler.log
COPY --from=web-build /app/dist /app/dist
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]

FROM runtime AS realtime
COPY --from=source /app/workers /app/workers
COPY --from=source /app/packages /app/packages
COPY --from=source /app/infra/postgis /app/infra/postgis
EXPOSE 8081
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD node -e "fetch('http://127.0.0.1:8081/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "run", "start:realtime"]
