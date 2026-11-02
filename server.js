require('dotenv').config();

const app = require('./src/app');

const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV || 'development';

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n===========================================');
  console.log('🚀 Human Resource Backend');
  console.log('===========================================');
  console.log(`Environment : ${NODE_ENV.toUpperCase()}`);
  console.log(`Port        : ${PORT}`);
  console.log(`Local       : http://localhost:${PORT}`);
  console.log(`Network     : http://0.0.0.0:${PORT}`);
  console.log('Server is running...');
  console.log('===========================================\n');
});

server.on('error', (error) => {
  console.error('Server startup error:', error);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server...');
  server.close(() => {
    console.log('HTTP Server Closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Closing server...');
  server.close(() => {
    console.log('HTTP Server Closed');
    process.exit(0);
  });
});