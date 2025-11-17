# BattleHub — Full Stack Competition Engine

BattleHub is a production-ready competition platform built with:

- Node.js + Express (Backend)
- MongoDB Atlas (Database)
- Next.js (Frontend)
- Render (Backend deployment)
- Vercel (Frontend deployment)

This project includes:
- Full admin system (users, matches, payouts)
- Matchmaking flow
- Health, readiness, liveness & metrics endpoints
- Logging + log rotation
- Deployment scripts
- Clean environment configuration

---

## 🚀 Project Structure

battlehub/
  ├── server/               # Express backend
  │     ├── index.js
  │     ├── routes/
  │     ├── middleware/
  │     ├── logs/
  │     └── start.sh
  │
  ├── client/               # Next.js frontend
  │     ├── pages/
  │     ├── public/
  │     └── package.json
  │
  ├── admin/                # Admin dashboard (Next.js)
  ├── .env.example
  ├── server/.env.example
  ├── client/.env.example
  └── README.md

---

## ⚙️ Local Development

### 1. Install dependencies
npm install --prefix server
npm install --prefix client
npm install --prefix admin

### 2. Start backend
npm run dev --prefix server
# http://localhost:4000

### 3. Start frontend
npm run dev --prefix client
# http://localhost:3000

### 4. Start admin dashboard
npm run dev --prefix admin

---

## 🔑 Environment Variables

### Server .env
PORT=4000
ADMIN_KEY=BattleHub2025Secret!
MONGO_URI=your_mongo_connection_string
ALLOWED_ORIGINS=https://battlehub-frontend.vercel.app,http://localhost:3000
PESAPAL_DISABLED=true
NODE_ENV=production

### Client .env
NEXT_PUBLIC_API_BASE=http://localhost:4000
NEXT_PUBLIC_ENV=development

---

## 🩺 Health Endpoints

/health     – general status  
/healthz    – simplified health  
/livez      – liveness probe  
/readyz     – readiness probe  
/metrics    – uptime + memory metrics  

---

## 🧾 Logging

server/logs/server.log  
server/logs/rotate.sh (auto deletes logs older than 7 days)

---

## 🛠 Deployment

### Render (Backend)
Start Command:
./start.sh

Health Checks:
- Liveness: /livez
- Readiness: /readyz

### Vercel (Frontend)
NEXT_PUBLIC_API_BASE=https://your-render-backend-url

---

## ✔ Status

Backend, frontend, admin dashboard, payouts, matchmaking, logs, metrics, and health checks are all working.  
Project is ready for deployment.

---

## 📧 Maintainer
BattleHub DevOps / dissantravormukisa

