FROM node:22-alpine AS build
WORKDIR /app
COPY apps/web/package.json ./package.json
RUN npm install --no-audit --no-fund
COPY apps/web ./
RUN npm run build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=20s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
