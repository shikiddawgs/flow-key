const fs = require('fs-extra');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const jsxbin = require('jsxbin');
const { execSync } = require('child_process');

const DIST_DIR = path.join(__dirname, 'dist', 'KidFaster');
const SRC_DIR = __dirname;

async function build() {
    console.log('🚀 Starting KidFaster Production Build...\n');

    try {
        // 1. Clean and Create Dist Directory
        console.log('[1/5] Cleaning distribution folder...');
        await fs.emptyDir(path.join(__dirname, 'dist'));
        await fs.ensureDir(DIST_DIR);

        // 2. Copy Files (Excluding dev artifacts)
        console.log('[2/5] Copying source files...');
        
        const foldersToCopy = ['client', 'CSXS', 'host', 'data'];
        for (const folder of foldersToCopy) {
            await fs.copy(path.join(SRC_DIR, folder), path.join(DIST_DIR, folder), {
                filter: (src) => {
                    const name = path.basename(src);
                    if (name === 'my_presets.json') return false;
                    return true;
                }
            });
        }
        
        // Copy install.bat
        if (await fs.pathExists(path.join(SRC_DIR, 'install.bat'))) {
            await fs.copy(path.join(SRC_DIR, 'install.bat'), path.join(DIST_DIR, 'install.bat'));
        }

        // 3. Obfuscate Client JS
        console.log('[3/5] Obfuscating client/script.js...');
        const scriptPath = path.join(DIST_DIR, 'client', 'script.js');
        const minScriptPath = path.join(DIST_DIR, 'client', 'script.min.js');
        
        if (await fs.pathExists(scriptPath)) {
            const rawCode = await fs.readFile(scriptPath, 'utf8');
            const obfuscationResult = JavaScriptObfuscator.obfuscate(rawCode, {
                compact: true,
                controlFlowFlattening: true,
                controlFlowFlatteningThreshold: 0.75,
                deadCodeInjection: true,
                deadCodeInjectionThreshold: 0.4,
                debugProtection: false,
                disableConsoleOutput: true,
                identifierNamesGenerator: 'hexadecimal',
                log: false,
                renameGlobals: false,
                stringArray: true,
                stringArrayEncoding: ['base64'],
                stringArrayThreshold: 0.75,
                unicodeEscapeSequence: false
            });
            
            await fs.writeFile(minScriptPath, obfuscationResult.getObfuscatedCode());
            await fs.remove(scriptPath); // Delete the original raw JS
            
            // Update index.html to point to script.min.js
            const indexPath = path.join(DIST_DIR, 'client', 'index.html');
            if (await fs.pathExists(indexPath)) {
                let html = await fs.readFile(indexPath, 'utf8');
                html = html.replace('src="script.js"', 'src="script.min.js"');
                await fs.writeFile(indexPath, html);
            }
        }

        // 4. Compile ExtendScript JSX to JSXBIN
        console.log('[4/5] Compiling host/index.jsx to JSXBIN...');
        const hostJsxPath = path.join(DIST_DIR, 'host', 'index.jsx');
        const hostJsxbinPath = path.join(DIST_DIR, 'host', 'index.jsxbin');
        
        if (await fs.pathExists(hostJsxPath)) {
            // Compile
            await jsxbin(hostJsxPath, hostJsxbinPath);
            await fs.remove(hostJsxPath); // Delete original JSX
            
            // Update manifest.xml to point to JSXBIN
            const manifestPath = path.join(DIST_DIR, 'CSXS', 'manifest.xml');
            if (await fs.pathExists(manifestPath)) {
                let manifest = await fs.readFile(manifestPath, 'utf8');
                manifest = manifest.replace('<ScriptPath>./host/index.jsx</ScriptPath>', '<ScriptPath>./host/index.jsxbin</ScriptPath>');
                await fs.writeFile(manifestPath, manifest);
            }
        }

        console.log('\n✅ Build completed successfully!');
        console.log(`📁 Output located at: ${DIST_DIR}`);

    } catch (err) {
        console.error('\n❌ Build failed:', err);
    }
}

build();
