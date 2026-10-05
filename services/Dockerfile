FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY services ./services
COPY scripts ./scripts
COPY data ./data
CMD ["npx", "tsx", "services/crm-service/src/index.ts"]
