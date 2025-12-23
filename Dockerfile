FROM node:20-alpine AS builder

# Установка git и инструментов для сборки
RUN apk add --no-cache git python3 make g++

WORKDIR /usr/src/app

# Клонируем и собираем библиотеку
RUN git clone https://github.com/max-messenger/max-bot-api-client-ts.git ./libs/max-bot-api-client-ts

WORKDIR /usr/src/app/libs/max-bot-api-client-ts
RUN npm install
RUN npm run build  # <-- создаёт dist/

# Вернёмся в корень
WORKDIR /usr/src/app

# Копируем package.json и устанавливаем зависимости (включая локальную библиотеку)
COPY package*.json ./
RUN npm install --omit=dev  # экономим место, dev-зависимости не нужны в рантайме

# Копируем исходники бота
COPY . .

EXPOSE 4444

CMD ["npm", "start"]
