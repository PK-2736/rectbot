#!/bin/bash
# Express server.js を PM2 で起動するスクリプト
pm2 start pm2-server.config.js --env production
