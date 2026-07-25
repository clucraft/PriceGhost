const axios = require('axios');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImlzX2FkbWluIjp0cnVlLCJpYXQiOjE3NzgyNzYyODUsImV4cCI6MTgwOTgzMzg4NX0.BBf0ZdFx5T73pTngY4E4Hrld6F_VxBmrr7epH2fnzZY';
const URLS = [
  'https://www.coles.com.au/product/cadbury-favourites-boxed-chocolate-265g-1115573',
  'https://www.harveynorman.com.au/jbl-boombox-4-portable-bluetooth-speaker.html',
  'https://www.bunnings.com.au/coleman-2-4m-ultra-compact-portable-gazebo_p0185612',
  'https://httpbin.org/headers'
];

async function run() {
  for (let i = 0; i < URLS.length; i++) {
    const url = URLS[i];
    const ua = `Test-Agent-Recycle-${i}`;
    console.log(`\n[Test ${i+1}] Scraping ${url} with UA: ${ua}`);
    try {
      const res = await axios.post('http://192.168.50.200:3003/api/admin/debug/extract', {
        url,
        config: { user_agent: ua, use_browser_scraper: true }
      }, {
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
      console.log(`[Success] Price: ${res.data.price?.price}, Name: ${res.data.name}`);
    } catch (e) {
      console.error(`[Error]`, e.response?.data || e.message);
    }
  }
}

run();