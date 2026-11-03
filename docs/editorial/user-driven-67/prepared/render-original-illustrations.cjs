// Local rendering of original SVG diagrams. No downloads or image-generation service.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
(async()=>{const dir=path.resolve('public/news-images');let rendered=0;for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.svg'))){const dest=path.join(dir,name.replace(/\.svg$/,'.png'));if(fs.existsSync(dest))continue;await sharp(path.join(dir,name)).png().toFile(dest);rendered++;}console.log(JSON.stringify({rendered,networkRequests:0}));})().catch(e=>{console.error(e.message);process.exitCode=1});
