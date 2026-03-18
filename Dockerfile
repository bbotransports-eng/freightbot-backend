FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
```

La seule différence : `npm install` au lieu de `npm ci` — `npm ci` exige un `package-lock.json` qu'on n'a pas, `npm install` fonctionne sans.

Cliquez **"Commit changes"** puis dans Railway :
```
Redeploy freightbot-backend
