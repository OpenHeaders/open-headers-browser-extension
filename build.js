const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const distDir = path.join(__dirname, 'dist');
const jsDir = path.join(distDir, 'js');

// Obfuscate background script
const backgroundFile = path.join(jsDir, 'background', 'index.js');
if (fs.existsSync(backgroundFile)) {
    const backgroundCode = fs.readFileSync(backgroundFile, 'utf8');
    const obfuscatedBackgroundCode = JavaScriptObfuscator.obfuscate(backgroundCode, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.5,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.3,
        stringArray: true,
        rotateStringArray: true,
        selfDefending: true,
        stringArrayThreshold: 0.8
    }).getObfuscatedCode();
    fs.writeFileSync(backgroundFile, obfuscatedBackgroundCode);
    console.log('Background script obfuscated');
}

// Obfuscate popup script
const popupFile = path.join(jsDir, 'popup', 'index.js');
if (fs.existsSync(popupFile)) {
    const popupCode = fs.readFileSync(popupFile, 'utf8');
    const obfuscatedPopupCode = JavaScriptObfuscator.obfuscate(popupCode, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.5,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.3,
        stringArray: true,
        rotateStringArray: true,
        selfDefending: true,
        stringArrayThreshold: 0.8
    }).getObfuscatedCode();
    fs.writeFileSync(popupFile, obfuscatedPopupCode);
    console.log('Popup script obfuscated');
}

console.log('Obfuscation complete!');