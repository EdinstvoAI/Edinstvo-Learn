FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 5188
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5188", "--strictPort"]
