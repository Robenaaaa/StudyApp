// index.html/style.css/app.js/manifest.json/assets를 www/ 로 복사합니다.
// GitHub Pages는 프로젝트 루트를 그대로 서비스하고, Capacitor는 www/를 앱에 담기 때문에
// 두 배포 대상이 항상 같은 내용을 갖도록 이 스크립트로 동기화합니다.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const wwwDir = path.join(root, 'www');

const filesToCopy = ['index.html', 'style.css', 'app.js', 'manifest.json'];

fs.mkdirSync(wwwDir, { recursive: true });
for (const file of filesToCopy) {
  fs.copyFileSync(path.join(root, file), path.join(wwwDir, file));
}
fs.cpSync(path.join(root, 'assets'), path.join(wwwDir, 'assets'), { recursive: true });

console.log('www/ synced from project root.');
