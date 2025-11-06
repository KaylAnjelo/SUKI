import cron from 'node-cron';
import fetch from 'node-fetch';

// call your own endpoint (or call compute function directly)
cron.schedule('0 3 * * *', async () => { // daily at 03:00
  console.log('Running daily recompute of owner recommendations');
  // call an authenticated job or run server-side compute for each owner
});