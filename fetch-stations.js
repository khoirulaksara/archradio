const fs = require('fs');
const axios = require('axios');

/**
 * Parallel Limit Utility
 * Prevents overwhelming the network while maintaining high speed.
 */
const pLimit = (limit) => {
  const queue = [];
  let active = 0;

  const next = () => {
    if (queue.length === 0 || active >= limit) return;

    active++;
    const { fn, resolve } = queue.shift();

    fn().then(result => {
      active--;
      resolve(result);
      next();
    }).catch(err => {
      active--;
      resolve(null);
      next();
    });
  };

  return (fn) => new Promise(res => {
    queue.push({ fn, resolve: res });
    next();
  });
};

const limit = pLimit(15); // Check 15 streams at once

async function checkStream(url) {
  try {
    const start = Date.now();
    const res = await axios.head(url, { timeout: 5000, validateStatus: false });
    const duration = Date.now() - start;
    
    return {
      status: res.status >= 200 && res.status < 400 ? 1 : 0,
      latency: duration,
      url: res.request.res.responseUrl || url
    };
  } catch (e) {
    return { status: 0, latency: 5000, url };
  }
}

async function processStations(stations) {
  console.log(`Processing ${stations.length} stations...`);
  
  const results = await Promise.all(
    stations.map(station => limit(async () => {
      // Only check the first 3 streams per station to save time
      const checkedStreams = await Promise.all(
        (station.streams || []).slice(0, 3).map(s => checkStream(s.url))
      );

      return {
        ...station,
        streams: (station.streams || []).map((s, i) => ({
          ...s,
          status: checkedStreams[i]?.status || 0,
          resolved_url: checkedStreams[i]?.url || s.url
        }))
      };
    }))
  );

  const finalData = {
    updated_at: Date.now(),
    total: results.length,
    data: results
  };

  fs.writeFileSync('indonesia.json', JSON.stringify(finalData, null, 2));
  console.log('Finished! Saved to indonesia.json');
}

// Example usage:
// const stations = JSON.parse(fs.readFileSync('raw_stations.json'));
// processStations(stations);
