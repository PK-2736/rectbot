// utils/cors.js
export function getCorsHeaders(origin) {
  const allowedOrigins = [
    'https://dash.recrubo.net',
    'https://recrubo.net',
    'https://www.recrubo.net',
    'http://localhost:3000',
    'http://localhost:3001'
  ];

  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-service-token',
    'Access-Control-Allow-Credentials': 'true',
  };
}
