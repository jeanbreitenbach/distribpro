FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=3100 DB_FILE=/data/repcrm.db
VOLUME /data
EXPOSE 3100
CMD ["node", "server.js"]
