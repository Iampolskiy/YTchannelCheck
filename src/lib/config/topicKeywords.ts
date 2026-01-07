/**
 * Keywords for topic filtering.
 * Each category contains a set of keywords that, if found frequently enough,
 * indicate the channel belongs to that category.
 */

// Kids/Children content keywords
export const KIDS_KEYWORDS = new Set([
  'kinder', 'kids', 'kind', 'spielzeug', 'toys', 'toy',
  'nursery', 'rhymes', 'lied', 'lieder', 'songs',
  'baby', 'babies', 'toddler', 'kleinkind',
  'cartoon', 'trickfilm', 'animation', 'animated',
  'schule', 'school', 'lernen', 'learn', 'education',
  'familie', 'family', 'fun', 'spaß',
  'challenge', 'prank', 'slime', 'diy',
  'minecraft', 'roblox', 'fortnite', // Often kids content
  'play', 'playing', 'gameplay',
  'unboxing', 'review',
  'puppenspiel', 'puppet',
  'märchen', 'fairy', 'tale',
  'gute nacht', 'bedtime',
  'disney', 'lego', 'playmobil', 'barbie',
  'paw patrol', 'peppa', 'pig',
]);

// Beauty/Fashion content keywords
export const BEAUTY_KEYWORDS = new Set([
  'beauty', 'schönheit', 'kosmetik', 'cosmetic',
  'makeup', 'make-up', 'schminke', 'schminken',
  'fashion', 'mode', 'style', 'styling',
  'outfit', 'look', 'haul', 'try-on',
  'skincare', 'hautpflege', 'routine',
  'hair', 'haare', 'frisur', 'hairstyle',
  'nail', 'nägel', 'manicure', 'pedicure',
  'tutorial', 'review', 'swatch',
  'vlog', 'lifestyle', 'influencer',
  'dm', 'rossmann', 'douglas', 'sephora',
  'zara', 'h&m', 'asos', 'shein',
]);

// Gaming content keywords
export const GAMING_KEYWORDS = new Set([
  'game', 'gaming', 'gamer', 'zocken', 'zocker',
  'play', 'player', 'playing', 'gameplay',
  'walkthrough', 'playthrough', 'let\'s play', 'lets play',
  'review', 'test', 'trailer',
  'stream', 'streamer', 'live', 'twitch',
  'minecraft', 'roblox', 'fortnite', 'gta', 'call of duty',
  'league of legends', 'valorant', 'csgo', 'counter strike',
  'nintendo', 'playstation', 'xbox', 'pc', 'console',
  'switch', 'ps5', 'ps4', 'xbox series',
  'mod', 'addon', 'hack', 'cheat', 'glitch',
  'speedrun', 'challenge',
]);

