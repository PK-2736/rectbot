const { cleanupExpiredRecruits } = require('./src/utils/db');

(async () => {
  try {
    console.log('Starting manual cleanup...');
    await cleanupExpiredRecruits();
    console.log('Cleanup completed successfully.');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
})();