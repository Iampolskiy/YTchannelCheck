import { runPrefilter } from './src/lib/prefilter/filters.js';

const channelInfo = {
  title: 'PewDiePie',
  description: 'Gaming videos',
  country: 'Japan',
  id: 'UC123',
  handle: '@PewDiePie',
  url: null,
  keywords: [],
  subscriberCountText: null,
  avatar: null,
  isFamilySafe: true,
};

try {
  console.log('Testing prefilter...');
  console.log('Channel info:', channelInfo);
  const result = runPrefilter(channelInfo, []);
  console.log('Result:', JSON.stringify(result, null, 2));
} catch (e) {
  console.log('Error:', e);
}

