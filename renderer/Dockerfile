
FROM mcr.microsoft.com/playwright:v1.47.2-jammy
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build
EXPOSE 8787
CMD ["node", "dist/index.js"]
