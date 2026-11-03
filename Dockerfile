FROM node:22-slim
# Private in-portal slides/document viewer: server-side Office → PDF, no public URLs.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-impress libreoffice-writer libreoffice-calc fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY public ./public
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "src/server.js"]
