import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

const files = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
];

const dir = path.join(process.cwd(), 'public', 'models');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

async function download(file) {
  const dest = path.join(dir, file);
  const url = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/${file}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (res2) => {
          const stream = fs.createWriteStream(dest);
          res2.pipe(stream);
          stream.on('finish', () => { stream.close(); resolve(); });
        }).on('error', reject);
        return;
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${file}: ${res.statusCode}`));
      }
      const stream = fs.createWriteStream(dest);
      res.pipe(stream);
      stream.on('finish', () => { stream.close(); resolve(); });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Downloading face-api model weights to public/models...');
  for (const f of files) {
    process.stdout.write(`Downloading ${f}... `);
    await download(f);
    console.log('Done');
  }
  console.log('All face models downloaded successfully!');
}

main().catch((err) => {
  console.error('Error downloading models:', err);
  process.exit(1);
});
