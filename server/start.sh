#!/bin/bash
cd "$(dirname "$0")"
mkdir -p logs
export NODE_ENV=production
export PORT=4000
node index.js >> logs/server.log 2>&1

